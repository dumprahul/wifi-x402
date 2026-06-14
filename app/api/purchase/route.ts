import { NextRequest, NextResponse } from 'next/server';
import { PLANS, CHAIN_ID, USDC_ADDRESS, RECEIVER_WALLET, WEBHOOK_URL } from '@/utils/constants';
import { relayerGetCapabilities, relayerGetFeeData, relayerSend7710Transaction } from '@/utils/relayer';

function encodeUSDCTransfer(to: string, amountUsdc: string): string {
  const selector = '0xa9059cbb'; // transfer(address,uint256)
  const paddedTo = to.replace('0x', '').toLowerCase().padStart(64, '0');
  const units = BigInt(Math.round(parseFloat(amountUsdc) * 1_000_000));
  const paddedAmount = units.toString(16).padStart(64, '0');
  return `0x${selector.replace('0x', '')}${paddedTo}${paddedAmount}`;
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { planId, wallet } = body;

  const plan = PLANS.find(p => p.id === planId);
  if (!plan) {
    return NextResponse.json({ error: 'Unknown plan' }, { status: 400 });
  }

  const xPayment = req.headers.get('x-payment') || req.headers.get('X-Payment');

  // ── First hit: no payment → return 402 ──────────────────────────────────
  if (!xPayment) {
    return NextResponse.json(
      {
        error: 'Payment Required',
        x402: {
          scheme: 'erc7710',
          network: `eip155:${CHAIN_ID}`,
          asset: USDC_ADDRESS,
          payTo: RECEIVER_WALLET,
          maxAmountRequired: plan.price_usdc,
          description: `Wifix402 — ${plan.name} WiFi access`,
          extra: { planId: plan.id, durationSeconds: plan.duration_seconds },
        },
      },
      {
        status: 402,
        headers: {
          'X-Payment-Version': '1',
          'WWW-Authenticate': 'x402 scheme="erc7710"',
        },
      }
    );
  }

  // ── Second hit: has payment delegation → submit to 1Shot ─────────────────
  let permissionsContext: unknown;
  try {
    permissionsContext = JSON.parse(xPayment);
  } catch {
    return NextResponse.json({ error: 'Invalid X-Payment header (not JSON)' }, { status: 400 });
  }

  console.log(`[Purchase] Plan=${plan.name}, wallet=${wallet}`);

  try {
    const chainIdStr = String(CHAIN_ID);

    // 1. Confirm USDC accepted
    const capabilities = await relayerGetCapabilities(chainIdStr);
    console.log('[1Shot] capabilities:', capabilities);

    // 2. Lock in fee quote
    const feeData = await relayerGetFeeData(chainIdStr, USDC_ADDRESS);
    console.log('[1Shot] feeData:', feeData);

    // 3. Submit ERC-7710 delegation tx
    const taskId = await relayerSend7710Transaction({
      chainId: chainIdStr,
      permissionContext: permissionsContext,
      transactions: [{
        to: USDC_ADDRESS,
        data: encodeUSDCTransfer(RECEIVER_WALLET, plan.price_usdc),
        value: '0x0',
      }],
      context: feeData?.context,
      destinationUrl: WEBHOOK_URL,
    });

    console.log(`[1Shot] taskId=${taskId}`);

    return NextResponse.json({
      success: true,
      taskId,
      plan: plan.name,
      paidUsdc: plan.price_usdc,
      durationSeconds: plan.duration_seconds,
      message: `Payment submitted. Task: ${taskId}`,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[Purchase] Relayer error:', msg);

    // In demo/testnet, return the task as simulated so UI can proceed
    const demoTaskId = `demo-${Date.now()}`;
    return NextResponse.json({
      success: true,
      taskId: demoTaskId,
      plan: plan.name,
      paidUsdc: plan.price_usdc,
      durationSeconds: plan.duration_seconds,
      simulated: true,
      relayerError: msg,
    });
  }
}
