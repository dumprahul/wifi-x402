import { NextRequest, NextResponse } from 'next/server';
import { encodeFunctionData, erc20Abi, parseUnits } from 'viem';
import { PLANS, CHAIN_ID, USDC_ADDRESS, USDC_DECIMALS, RECEIVER_WALLET, BASE_URL, WEBHOOK_URL } from '@/utils/constants';
import { getCapabilities, getFeeData, estimate7710Transaction, send7710Transaction, Execution7710 } from '@/utils/relayer';
import { createSession } from '@/lib/sessions';

/** Convert minFee from 1Shot — may be decimal "0.01" or atom string "10000" — to BigInt atoms. */
function parseFeeToAtoms(minFee: string): bigint {
  return minFee.includes('.') ? parseUnits(minFee, USDC_DECIMALS) : BigInt(minFee);
}

function safeBase64Encode(str: string): string {
  return Buffer.from(str).toString('base64');
}

function getClientIP(req: NextRequest): string {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
    req.headers.get('x-real-ip') ||
    '127.0.0.1'
  );
}

const CHAIN_ID_STR = String(CHAIN_ID);

// ── 1Shot relayer info (fetched per request; stable per session) ────────────
async function get1ShotInfo(): Promise<{
  targetAddress: `0x${string}`;
  feeCollector: `0x${string}`;
  minFee: string;
  feeContext?: string;
}> {
  const [caps, feeData] = await Promise.all([
    getCapabilities(CHAIN_ID_STR),
    getFeeData(CHAIN_ID_STR, USDC_ADDRESS),
  ]);
  const chainCaps = caps[CHAIN_ID_STR];
  if (!chainCaps) throw new Error(`1Shot: chain ${CHAIN_ID_STR} not in capabilities`);
  // Normalize minFee to atom units (1Shot may return "0.01" or "10000")
  const feeAtoms = parseFeeToAtoms(feeData.minFee).toString();
  return {
    targetAddress: feeData.targetAddress ?? chainCaps.targetAddress,
    feeCollector: chainCaps.feeCollector,
    minFee: feeAtoms,         // always in USDC atoms — safe for BigInt() in browser
    feeContext: feeData.context,
  };
}

function buildPaymentRequired(
  plan: typeof PLANS[number],
  resource: string,
  relayerInfo: { targetAddress: `0x${string}`; feeCollector: `0x${string}`; minFee: string },
) {
  return {
    x402Version: 2,
    accepts: [{
      scheme: 'exact',
      network: `eip155:${CHAIN_ID}`,
      amount: plan.price_units,
      maxAmountRequired: plan.price_units,
      resource,
      description: `Wifix402 — ${plan.name} WiFi access`,
      mimeType: 'application/json',
      payTo: RECEIVER_WALLET,
      maxTimeoutSeconds: 300,
      asset: USDC_ADDRESS,
      extra: {
        planId: plan.id,
        durationSeconds: plan.duration_seconds,
        assetTransferMethod: 'erc7710',
        // 1Shot relayer info — browser uses targetAddress to sign delegation `to`
        targetAddress: relayerInfo.targetAddress,
        feeCollector: relayerInfo.feeCollector,
        feeAmount: relayerInfo.minFee,
      },
    }],
    error: null,
  };
}

function buildExecutions(
  feeCollector: `0x${string}`,
  feeAmount: bigint,
  workAmount: bigint,
): Execution7710[] {
  const feeTx = encodeFunctionData({ abi: erc20Abi, functionName: 'transfer', args: [feeCollector, feeAmount] });
  const workTx = encodeFunctionData({ abi: erc20Abi, functionName: 'transfer', args: [RECEIVER_WALLET, workAmount] });
  return [
    { target: USDC_ADDRESS, value: '0', data: feeTx },
    { target: USDC_ADDRESS, value: '0', data: workTx },
  ];
}

// ── Route handler ──────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { planId, wallet, mac } = body as { planId?: string; wallet?: string; mac?: string };

  if (!planId || !wallet) {
    return NextResponse.json({ error: 'Missing planId or wallet' }, { status: 400 });
  }
  const plan = PLANS.find(p => p.id === planId);
  if (!plan) {
    return NextResponse.json({ error: `Unknown plan: ${planId}` }, { status: 400 });
  }

  const clientIP = getClientIP(req);
  const rawSig = req.headers.get('payment-signature') || req.headers.get('x-payment');

  // ── FIRST HIT: return 402 with PAYMENT-REQUIRED ──────────────────────────
  if (!rawSig) {
    let relayerInfo: Awaited<ReturnType<typeof get1ShotInfo>>;
    try {
      relayerInfo = await get1ShotInfo();
    } catch (err) {
      console.error('[1Shot] capabilities fetch failed:', err);
      return NextResponse.json({ error: '1Shot relayer unavailable' }, { status: 503 });
    }

    const resource = `${BASE_URL}/api/purchase`;
    const paymentRequired = buildPaymentRequired(plan, resource, relayerInfo);
    const encoded = safeBase64Encode(JSON.stringify(paymentRequired));
    console.log(`[x402] 402 → IP=${clientIP} plan=${plan.name} targetAddress=${relayerInfo.targetAddress}`);

    return NextResponse.json(
      { ...paymentRequired, error: 'Payment Required' },
      {
        status: 402,
        headers: {
          'PAYMENT-REQUIRED': encoded,
          'Access-Control-Expose-Headers': 'PAYMENT-REQUIRED',
        },
      },
    );
  }

  // ── SECOND HIT: process payment via 1Shot relayer ────────────────────────
  let paymentPayload: {
    x402Version?: number;
    payload?: {
      delegations?: unknown[];
      delegator?: string;
      feeCollector?: string;
      feeAmount?: string;
    };
  };

  try {
    paymentPayload = JSON.parse(Buffer.from(rawSig, 'base64').toString('utf8'));
  } catch {
    try { paymentPayload = JSON.parse(rawSig); } catch {
      return NextResponse.json({ error: 'PAYMENT-SIGNATURE: invalid format' }, { status: 400 });
    }
  }

  const { delegations, delegator, feeCollector, feeAmount } = paymentPayload.payload ?? {};

  console.log(`[x402] v${paymentPayload.x402Version} payment from delegator=${delegator}`);
  console.log(`[x402] delegations count=${Array.isArray(delegations) ? delegations.length : 'none'}`);

  if (!delegations || !Array.isArray(delegations) || delegations.length === 0) {
    return NextResponse.json({ error: 'Missing delegations in payment payload' }, { status: 400 });
  }

  if (!feeCollector || !feeAmount) {
    return NextResponse.json({ error: 'Missing feeCollector or feeAmount in payment payload' }, { status: 400 });
  }

  const executions = buildExecutions(
    feeCollector as `0x${string}`,
    BigInt(feeAmount),
    BigInt(plan.price_units),
  );

  // Estimate first (validates bundle + gets fresh price-lock context)
  let sendContext: string | undefined;
  try {
    const estimate = await estimate7710Transaction(CHAIN_ID_STR, delegations, executions);
    if (!estimate.success) {
      console.error('[1Shot] estimate failed:', estimate.error);
      return NextResponse.json({ error: `1Shot estimate failed: ${estimate.error}` }, { status: 400 });
    }
    sendContext = estimate.context;
    console.log(`[1Shot] estimate OK — requiredPayment=${estimate.requiredPaymentAmount}`);
  } catch (err) {
    console.warn('[1Shot] estimate error (proceeding without context):', err);
  }

  // Submit to 1Shot relayer
  let taskId: string;
  try {
    taskId = await send7710Transaction({
      chainId: CHAIN_ID_STR,
      delegations,
      executions,
      context: sendContext,
      destinationUrl: WEBHOOK_URL,
      memo: `wifix402-${plan.id}-${clientIP}`,
    });
    console.log(`[1Shot] submitted taskId=${taskId}`);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[1Shot] send failed:', msg);
    return NextResponse.json({ error: `1Shot relay failed: ${msg}` }, { status: 500 });
  }

  // Create pending session (webhook will activate it when confirmed)
  let session;
  try {
    session = await createSession({
      ip: clientIP,
      mac,
      wallet: delegator ?? wallet,
      planId: plan.id,
      planName: plan.name,
      durationSeconds: plan.duration_seconds,
      paidUsdc: plan.price_usdc,
      taskId,
      permissionsContext: { delegations, feeCollector, feeAmount },
    });
    console.log(`[DB] Session ${session.id} pending — waiting for 1Shot confirmation`);
  } catch (dbErr) {
    console.error('[DB] Session save error:', dbErr);
  }

  return NextResponse.json(
    {
      success: true,
      sessionId: session?.id,
      taskId,
      plan: plan.name,
      paidUsdc: plan.price_usdc,
      durationSeconds: plan.duration_seconds,
      message: `Submitted to 1Shot relayer. TaskId: ${taskId}`,
    },
    {
      headers: {
        'PAYMENT-RESPONSE': safeBase64Encode(JSON.stringify({ success: true, taskId })),
        'Access-Control-Expose-Headers': 'PAYMENT-RESPONSE',
      },
    },
  );
}
