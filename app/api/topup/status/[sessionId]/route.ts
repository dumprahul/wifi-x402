import { NextRequest, NextResponse } from 'next/server';
import { getTopupSession } from '@/lib/topup-sessions';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  const { sessionId } = await params;
  const session = await getTopupSession(sessionId);
  if (!session) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const nowMs = Date.now();
  const startMs = session.start_time ?? nowMs;
  const elapsed = session.state === 'active'
    ? Math.min(Math.floor((nowMs - startMs) / 1000), session.max_duration_seconds)
    : (session.actual_seconds ?? 0);

  const estimatedAtoms =
    session.state === 'active'
      ? (BigInt(elapsed) * BigInt(session.rate_per_second_atoms)).toString()
      : (session.actual_charged_atoms ?? '0');

  return NextResponse.json({
    sessionId: session.id,
    state: session.state,
    maxSeconds: session.max_duration_seconds,
    ratePerSecondAtoms: session.rate_per_second_atoms.toString(),
    startTime: session.start_time,
    stopTime: session.stop_time,
    elapsed,
    estimatedChargeAtoms: estimatedAtoms,
    estimatedChargeUsdc: (Number(estimatedAtoms) / 1_000_000).toFixed(6),
    actualSeconds: session.actual_seconds,
    actualChargedAtoms: session.actual_charged_atoms,
    actualChargedUsdc: session.actual_charged_atoms
      ? (Number(session.actual_charged_atoms) / 1_000_000).toFixed(6)
      : null,
    transactionHash: session.transaction_hash,
    taskId: session.task_id,
  });
}
