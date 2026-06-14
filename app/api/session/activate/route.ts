/**
 * POST /api/session/activate
 * Demo/dev mode: manually activate a pending session by taskId
 * In production this is done automatically by the 1Shot webhook
 */
import { NextRequest, NextResponse } from 'next/server';
import { activateSession } from '@/lib/sessions';
import { allowIP } from '@/lib/firewall';

export async function POST(req: NextRequest) {
  const { taskId } = await req.json().catch(() => ({}));
  if (!taskId) return NextResponse.json({ error: 'Missing taskId' }, { status: 400 });

  const session = await activateSession(taskId, 'demo-activation');
  if (!session) {
    return NextResponse.json({ error: 'No pending session for this taskId' }, { status: 404 });
  }

  await allowIP(session.ip, session.id, 'demo_activation');

  return NextResponse.json({
    activated: true,
    sessionId: session.id,
    ip: session.ip,
    expiresAt: session.expires_at,
    remainingSeconds: Math.floor((session.expires_at - Date.now()) / 1000),
  });
}
