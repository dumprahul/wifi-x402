import { NextRequest, NextResponse } from 'next/server';
import { CHAIN_ID } from '@/utils/constants';
import { getRelayerStatus } from '@/utils/relayer';
import { getTopupSession, finalizeTopupSession } from '@/lib/topup-sessions';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  const { sessionId } = await params;
  let session = await getTopupSession(sessionId);
  if (!session) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // Self-heal: if stopping, poll 1Shot directly rather than waiting for webhook.
  // Webhooks can't reach localhost in dev; this makes confirmation webhook-independent.
  if (session.state === 'stopping' && session.task_id) {
    try {
      const relayerStatus = await getRelayerStatus(session.task_id, String(CHAIN_ID));
      const txHash =
        relayerStatus.receipt?.transactionHash ?? relayerStatus.hash ?? '';

      if (relayerStatus.status === 200 && txHash) {
        // Confirmed — finalize directly
        const finalized = await finalizeTopupSession(session.task_id, txHash);
        if (finalized) {
          session = finalized;
          console.log(`[Topup/status] Self-healed: sessionId=${sessionId} txHash=${txHash}`);
        }
      } else if (relayerStatus.status === 400 || relayerStatus.status === 500) {
        // 1Shot failed — mark expired so UI can show error
        console.error(`[Topup/status] 1Shot task failed: taskId=${session.task_id} status=${relayerStatus.status}`);
      }
    } catch (err) {
      // Non-fatal — keep showing 'stopping', try again on next poll
      console.warn('[Topup/status] relayerStatus check failed (will retry):', err);
    }
  }

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
