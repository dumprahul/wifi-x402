import { NextRequest, NextResponse } from 'next/server';
import { parseUnits } from 'viem';
import { CHAIN_ID, USDC_ADDRESS, USDC_DECIMALS, TOPUP_OPTIONS, TOPUP_RATE_PER_SECOND_ATOMS } from '@/utils/constants';
import { getCapabilities, getFeeData } from '@/utils/relayer';
import { createTopupSession } from '@/lib/topup-sessions';

function getClientIP(req: NextRequest): string {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
    req.headers.get('x-real-ip') ||
    '127.0.0.1'
  );
}

function parseFeeToAtoms(minFee: string): bigint {
  return minFee.includes('.') ? parseUnits(minFee, USDC_DECIMALS) : BigInt(minFee);
}

const CHAIN_ID_STR = String(CHAIN_ID);

/*
  POST /api/topup/delegate
  First leg of top-up flow: browser sends the signed delegation and chosen duration.
  Server stores everything — does NOT execute yet.
  Returns { sessionId, targetAddress, maxAtoms, feeAmountAtoms } so the browser
  can show a "ready to start" state and pass the right value to requestExecutionPermissions.
*/
export async function GET(req: NextRequest) {
  // GET returns the 1Shot relay info so the browser can build the delegation BEFORE signing
  try {
    const [caps, feeData] = await Promise.all([
      getCapabilities(CHAIN_ID_STR),
      getFeeData(CHAIN_ID_STR, USDC_ADDRESS),
    ]);
    const chainCaps = caps[CHAIN_ID_STR];
    if (!chainCaps) throw new Error(`1Shot: chain ${CHAIN_ID_STR} not in capabilities`);

    const feeAtoms = parseFeeToAtoms(feeData.minFee).toString();
    return NextResponse.json({
      targetAddress: feeData.targetAddress ?? chainCaps.targetAddress,
      feeCollector: chainCaps.feeCollector,
      feeAmountAtoms: feeAtoms,
      options: TOPUP_OPTIONS,
      ratePerMinuteAtoms: (TOPUP_RATE_PER_SECOND_ATOMS * 60n).toString(),
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 503 });
  }
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({})) as {
    wallet?: string;
    minutes?: number;
    delegations?: unknown[];
    feeCollector?: string;
    feeAmountAtoms?: string;
  };

  const { wallet, minutes, delegations, feeCollector, feeAmountAtoms } = body;

  if (!wallet || !minutes || !delegations?.length || !feeCollector || !feeAmountAtoms) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  const option = TOPUP_OPTIONS.find(o => o.minutes === minutes);
  if (!option) {
    return NextResponse.json({ error: `Invalid duration: ${minutes} min` }, { status: 400 });
  }

  const ip = getClientIP(req);

  let session;
  try {
    session = await createTopupSession({
      ip,
      wallet,
      maxMinutes: minutes,
      ratePerSecondAtoms: TOPUP_RATE_PER_SECOND_ATOMS,
      delegationData: { delegations, wallet },
      feeCollector,
      feeAmountAtoms,
    });
  } catch (err) {
    console.error('[Topup/delegate] DB error:', err);
    return NextResponse.json({ error: 'Failed to save delegation' }, { status: 500 });
  }

  console.log(`[Topup] Delegation stored sessionId=${session.id} wallet=${wallet} maxMin=${minutes} ip=${ip}`);

  return NextResponse.json({
    sessionId: session.id,
    maxMinutes: minutes,
    maxAtoms: option.maxAtoms,
    ratePerMinuteAtoms: (TOPUP_RATE_PER_SECOND_ATOMS * 60n).toString(),
    state: 'delegated',
  });
}
