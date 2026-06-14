import { NextRequest, NextResponse } from 'next/server';
import { hasActiveSession } from '@/lib/sessions';
import { secondsRemaining } from '@/lib/expiry';

/**
 * GET /api/session/status
 * Returns the active session for the caller's IP address.
 * Used by the captive portal to check if a device already has access.
 */
export async function GET(req: NextRequest) {
  const clientIP =
    req.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
    req.headers.get('x-real-ip') ||
    '127.0.0.1';

  const session = await hasActiveSession(clientIP);

  if (!session) {
    return NextResponse.json({ active: false, ip: clientIP }, { status: 404 });
  }

  const remaining = await secondsRemaining(clientIP);

  return NextResponse.json({
    active: true,
    ip: clientIP,
    sessionId: session.id,
    plan: session.plan_name,
    wallet: session.wallet,
    paidUsdc: session.paid_usdc,
    expiresAt: session.expires_at,
    remainingSeconds: remaining,
    remainingMinutes: Math.floor(remaining / 60),
  });
}
