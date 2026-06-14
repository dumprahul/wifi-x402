import { NextRequest, NextResponse } from 'next/server';
import { encodeFunctionData, erc20Abi } from 'viem';
import { CHAIN_ID, USDC_ADDRESS, RECEIVER_WALLET, WEBHOOK_URL } from '@/utils/constants';
import { estimate7710Transaction, send7710Transaction, Execution7710 } from '@/utils/relayer';
import { getTopupSession, markTopupStopping } from '@/lib/topup-sessions';
import { blockIP } from '@/lib/firewall';

const CHAIN_ID_STR = String(CHAIN_ID);

function buildExecutions(
  feeCollector: `0x${string}`,
  feeAmount: bigint,
  workAmount: bigint,
): Execution7710[] {
  return [
    {
      target: USDC_ADDRESS,
      value: '0',
      data: encodeFunctionData({ abi: erc20Abi, functionName: 'transfer', args: [feeCollector, feeAmount] }),
    },
    {
      target: USDC_ADDRESS,
      value: '0',
      data: encodeFunctionData({ abi: erc20Abi, functionName: 'transfer', args: [RECEIVER_WALLET, workAmount] }),
    },
  ];
}

/*
  POST /api/topup/stop
  Client sends { sessionId }.
  Server:
    1. Calculates actual usage time + charge
    2. Executes the stored delegation via 1Shot for the actual (lower) amount
    3. Blocks IP immediately
    4. Returns taskId — webhook will finalize to 'stopped'
*/
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({})) as { sessionId?: string };
  const { sessionId } = body;

  if (!sessionId) return NextResponse.json({ error: 'Missing sessionId' }, { status: 400 });

  const session = await getTopupSession(sessionId);
  if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 });
  if (session.state !== 'active') {
    return NextResponse.json({ error: `Session is ${session.state}, not active` }, { status: 409 });
  }

  // Calculate actual usage
  const nowMs = Date.now();
  const startMs = session.start_time ?? nowMs;
  const rawSeconds = Math.floor((nowMs - startMs) / 1000);
  const actualSeconds = Math.min(rawSeconds, session.max_duration_seconds);
  const rateAtoms = BigInt(session.rate_per_second_atoms);
  const actualAtoms = BigInt(actualSeconds) * rateAtoms;
  const feeAtoms = BigInt(session.fee_amount_atoms);

  // Minimum 1 second to avoid zero-amount tx
  const chargeAtoms = actualAtoms < 1n ? 1n : actualAtoms;

  console.log(`[Topup/stop] sessionId=${sessionId} actualSec=${actualSeconds} chargeAtoms=${chargeAtoms} feeAtoms=${feeAtoms}`);

  const { delegations } = session.delegation_data as { delegations: unknown[] };

  const executions = buildExecutions(
    session.fee_collector as `0x${string}`,
    feeAtoms,
    chargeAtoms,
  );

  // Validate with 1Shot estimate first
  let sendContext: string | undefined;
  try {
    const est = await estimate7710Transaction(CHAIN_ID_STR, delegations, executions);
    if (!est.success) {
      console.error('[Topup/stop] estimate failed:', est.error);
      return NextResponse.json({ error: `1Shot estimate failed: ${est.error}` }, { status: 400 });
    }
    sendContext = est.context;
  } catch (err) {
    console.warn('[Topup/stop] estimate error (continuing):', err);
  }

  // Submit to 1Shot — executes delegation for the ACTUAL amount (≤ max delegation)
  let taskId: string;
  try {
    taskId = await send7710Transaction({
      chainId: CHAIN_ID_STR,
      delegations,
      executions,
      context: sendContext,
      destinationUrl: WEBHOOK_URL,
      memo: `wifix402-topup-stop-${sessionId.slice(0, 8)}-${actualSeconds}s`,
    });
    console.log(`[Topup/stop] 1Shot taskId=${taskId}`);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[Topup/stop] 1Shot send failed:', msg);
    return NextResponse.json({ error: `1Shot relay failed: ${msg}` }, { status: 500 });
  }

  // Mark DB as stopping
  await markTopupStopping(sessionId, taskId, actualSeconds, chargeAtoms.toString());

  // Block IP immediately — don't wait for webhook
  try {
    await blockIP(session.ip, sessionId, 'topup_stop');
  } catch (err) {
    console.warn('[Topup/stop] pfctl blockIP failed (non-fatal):', err);
  }

  const actualUsdcHuman = (Number(chargeAtoms) / 1_000_000).toFixed(6);

  return NextResponse.json({
    success: true,
    sessionId,
    taskId,
    actualSeconds,
    actualChargedAtoms: chargeAtoms.toString(),
    actualChargedUsdc: actualUsdcHuman,
    state: 'stopping',
    message: `Settling payment of ${actualUsdcHuman} USDC via 1Shot. Internet blocked.`,
  });
}
