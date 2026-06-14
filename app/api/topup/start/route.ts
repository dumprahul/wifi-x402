import { NextRequest, NextResponse } from 'next/server';
import { allowIP } from '@/lib/firewall';
import { getTopupSession, startTopupSession } from '@/lib/topup-sessions';
import { BASE_URL } from '@/utils/constants';

function getClientIP(req: NextRequest): string {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
    req.headers.get('x-real-ip') ||
    '127.0.0.1'
  );
}

function safeBase64Encode(s: string) {
  return Buffer.from(s).toString('base64');
}

/*
  POST /api/topup/start
  x402-style gate: first call returns 402 requiring proof of delegation.
  Client sends PAYMENT-SIGNATURE: base64({sessionId}) on retry.
  Server validates session is in 'delegated' state, enables internet.
*/
export async function POST(req: NextRequest) {
  const credential = req.headers.get('payment-signature') || req.headers.get('x-session-credential');
  const ip = getClientIP(req);

  // ── FIRST HIT: no credential → return 402 ────────────────────────────────
  if (!credential) {
    const body = await req.json().catch(() => ({})) as { sessionId?: string };
    if (!body.sessionId) {
      return NextResponse.json({ error: 'Missing sessionId' }, { status: 400 });
    }
    // Confirm session exists and is in delegated state before issuing 402
    const session = await getTopupSession(body.sessionId);
    if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    if (session.state !== 'delegated') {
      return NextResponse.json({ error: `Session is ${session.state}, not delegated` }, { status: 409 });
    }

    const paymentRequired = {
      scheme: 'wifix402-topup',
      version: 1,
      resource: `${BASE_URL}/api/topup/start`,
      description: 'Include your delegation session credential to start internet access',
      sessionId: body.sessionId,
    };

    console.log(`[Topup/start] 402 → sessionId=${body.sessionId} ip=${ip}`);
    return NextResponse.json(
      { ...paymentRequired, error: 'Payment credential required' },
      {
        status: 402,
        headers: {
          'PAYMENT-REQUIRED': safeBase64Encode(JSON.stringify(paymentRequired)),
          'Access-Control-Expose-Headers': 'PAYMENT-REQUIRED',
        },
      },
    );
  }

  // ── SECOND HIT: credential present → validate + start ────────────────────
  let parsed: { sessionId?: string };
  try {
    parsed = JSON.parse(Buffer.from(credential, 'base64').toString('utf8'));
  } catch {
    try { parsed = JSON.parse(credential); } catch {
      return NextResponse.json({ error: 'Invalid credential format' }, { status: 400 });
    }
  }

  const { sessionId } = parsed;
  if (!sessionId) return NextResponse.json({ error: 'Missing sessionId in credential' }, { status: 400 });

  const session = await getTopupSession(sessionId);
  if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 });
  if (session.state !== 'delegated') {
    return NextResponse.json({ error: `Session already ${session.state}` }, { status: 409 });
  }

  const started = await startTopupSession(sessionId);
  if (!started) return NextResponse.json({ error: 'Failed to start session (state conflict)' }, { status: 409 });

  // Enable firewall rule — fire and forget, never block the HTTP response
  allowIP(ip, sessionId, 'topup_start').catch(err =>
    console.warn('[Topup/start] pfctl allowIP failed (non-fatal):', err),
  );

  console.log(`[Topup] Session ${sessionId} STARTED ip=${ip} maxSec=${started.max_duration_seconds}`);

  return NextResponse.json(
    {
      success: true,
      sessionId,
      startTime: started.start_time,
      maxSeconds: started.max_duration_seconds,
      ratePerSecondAtoms: started.rate_per_second_atoms.toString(),
      expiresAt: (started.start_time ?? Date.now()) + started.max_duration_seconds * 1000,
    },
    {
      headers: {
        'PAYMENT-RESPONSE': safeBase64Encode(JSON.stringify({ success: true, sessionId })),
        'Access-Control-Expose-Headers': 'PAYMENT-RESPONSE',
      },
    },
  );
}
