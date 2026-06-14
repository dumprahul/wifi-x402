import { NextResponse } from 'next/server';
import { db } from '@/lib/supabase';
import { getCapabilities } from '@/utils/relayer';
import { CHAIN_ID, USDC_ADDRESS, RECEIVER_WALLET } from '@/utils/constants';

/**
 * GET /api/health
 * System health check — verifies Supabase connectivity and 1Shot relayer reachability.
 */
export async function GET() {
  const checks: Record<string, { ok: boolean; detail?: string }> = {};

  // Supabase
  try {
    const { error } = await db().from('sessions').select('id').limit(1);
    checks.supabase = { ok: !error, detail: error?.message };
  } catch (e) {
    checks.supabase = { ok: false, detail: String(e) };
  }

  // 1Shot relayer
  try {
    const caps = await getCapabilities(String(CHAIN_ID));
    const supported = !!caps[String(CHAIN_ID)];
    checks.relayer = { ok: supported, detail: supported ? 'chain supported' : 'chain not in capabilities' };
  } catch (e) {
    checks.relayer = { ok: false, detail: String(e) };
  }

  const allOk = Object.values(checks).every(c => c.ok);

  return NextResponse.json(
    {
      status: allOk ? 'ok' : 'degraded',
      chain: CHAIN_ID,
      usdc: USDC_ADDRESS,
      receiver: RECEIVER_WALLET,
      checks,
      ts: new Date().toISOString(),
    },
    { status: allOk ? 200 : 503 },
  );
}
