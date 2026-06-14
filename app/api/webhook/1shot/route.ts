import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/supabase';
import { activateSession } from '@/lib/sessions';
import { finalizeTopupSession, getTopupSessionByTaskId } from '@/lib/topup-sessions';
import { allowIP } from '@/lib/firewall';

/*
  1Shot webhook shape:
    { apiVersion: 0, type: 0|1|4, data: { id, status, hash?, receipt? }, timestamp, keyId, signature }
  type: 4 = Submitted (tx broadcast), 0 = Confirmed, 1 = Failure/Reverted
*/

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({})) as Record<string, unknown>;

  // 1Shot uses numeric `type` + nested `data`; legacy used flat string `status`
  const is1Shot = typeof body.type === 'number' && typeof body.data === 'object' && body.data !== null;
  const data = (is1Shot ? body.data : body) as Record<string, unknown>;

  const taskId = (data.id ?? body.taskId ?? body.task_id ?? '') as string;
  const receipt = data.receipt as Record<string, unknown> | undefined;
  const txHash = (receipt?.transactionHash ?? data.hash ?? body.txHash ?? body.transactionHash ?? '') as string;

  const webhookType = is1Shot ? (body.type as number) : -1;
  const legacyStatus = ((body.status ?? body.Status ?? '') as string).toLowerCase();

  const isConfirmed = webhookType === 0 || legacyStatus === 'confirmed';
  const isSubmitted = webhookType === 4 || legacyStatus === 'submitted';
  const isFailed    = webhookType === 1 || ['rejected', 'reverted', 'failed'].includes(legacyStatus);

  const label = is1Shot
    ? ({ 0: 'confirmed', 1: 'failed', 4: 'submitted' } as Record<number, string>)[webhookType] ?? 'unknown'
    : legacyStatus || 'unknown';

  console.log(`[Webhook/1Shot] taskId=${taskId} type=${webhookType} status=${label} tx=${txHash}`);

  await db().from('webhook_events').insert({
    task_id: taskId,
    event_type: label,
    payload: body,
    transaction_hash: txHash || null,
    processed: false,
  });

  if (isConfirmed) {
    // Check if this is a topup stop confirmation first
    const topupSession = await getTopupSessionByTaskId(taskId);
    if (topupSession) {
      const finalized = await finalizeTopupSession(taskId, txHash);
      if (finalized) {
        console.log(`[Webhook] Topup session finalized: ${finalized.id} charged=${finalized.actual_charged_atoms} atoms tx=${txHash}`);
        await db().from('webhook_events').update({ processed: true }).eq('task_id', taskId);
        return NextResponse.json({ received: true, action: 'topup_finalized', sessionId: finalized.id, chargedAtoms: finalized.actual_charged_atoms });
      }
    }

    // Otherwise it's a plan-based session activation
    const session = await activateSession(taskId, txHash);
    if (session) {
      console.log(`[Webhook] Session activated: ${session.id} IP=${session.ip}`);
      await allowIP(session.ip, session.id, '1shot_confirmed');
      await db().from('webhook_events').update({ processed: true }).eq('task_id', taskId);
      return NextResponse.json({ received: true, action: 'session_activated', sessionId: session.id, ip: session.ip });
    }
    console.warn(`[Webhook] No pending session for taskId=${taskId}`);

  } else if (isSubmitted) {
    await db().from('sessions')
      .update({ transaction_hash: txHash, updated_at: new Date().toISOString() })
      .eq('task_id', taskId).eq('status', 'pending')
      ;
    console.log(`[Webhook] Submitted tx=${txHash} for taskId=${taskId}`);

  } else if (isFailed) {
    await db().from('sessions')
      .update({ status: 'expired', updated_at: new Date().toISOString() })
      .eq('task_id', taskId).eq('status', 'pending')
      ;
    console.error(`[Webhook] Task ${taskId} FAILED (${label})`);
  }

  return NextResponse.json({ received: true, taskId, status: label });
}
