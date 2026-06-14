/**
 * GET /api/firewall/check?ip=192.168.x.x
 *
 * Called by the Mac's internet-sharing script every N seconds.
 * Returns { allowed: true/false } based on active Supabase session.
 * The script then adds/removes the IP from pfctl table accordingly.
 */
import { NextRequest, NextResponse } from 'next/server';
import { hasActiveSession, expireOldSessions } from '@/lib/sessions';
import { allowIP, blockIP } from '@/lib/firewall';

export async function GET(req: NextRequest) {
  const ip = req.nextUrl.searchParams.get('ip');
  if (!ip) {
    return NextResponse.json({ error: 'Missing ip param' }, { status: 400 });
  }

  // Expire stale sessions (cleanup)
  await expireOldSessions();

  const session = await hasActiveSession(ip);
  const allowed = !!session;

  if (allowed) {
    // Ensure IP is in the allow table
    await allowIP(ip, session!.id, 'valid_session_check');
  } else {
    // Ensure IP is blocked
    await blockIP(ip, undefined, 'no_valid_session');
  }

  const remaining = session
    ? Math.max(0, Math.floor((session.expires_at - Date.now()) / 1000))
    : 0;

  return NextResponse.json({
    ip,
    allowed,
    sessionId: session?.id ?? null,
    planName: session?.plan_name ?? null,
    expiresAt: session?.expires_at ?? null,
    remainingSeconds: remaining,
  });
}
