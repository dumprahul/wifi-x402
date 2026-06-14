import { db } from './supabase';

export interface TopupSession {
  id: string;
  ip: string;
  wallet: string;
  max_duration_seconds: number;
  rate_per_second_atoms: number;
  delegation_data: object;
  fee_collector: string;
  fee_amount_atoms: string;
  state: 'delegated' | 'active' | 'stopping' | 'stopped' | 'expired';
  start_time: number | null;
  stop_time: number | null;
  actual_seconds: number | null;
  actual_charged_atoms: string | null;
  task_id: string | null;
  transaction_hash: string | null;
  created_at: string;
  updated_at: string;
}

export async function createTopupSession(data: {
  ip: string;
  wallet: string;
  maxMinutes: number;
  ratePerSecondAtoms: bigint;
  delegationData: object;
  feeCollector: string;
  feeAmountAtoms: string;
}): Promise<TopupSession> {
  const { data: row, error } = await db()
    .from('topup_sessions')
    .insert({
      ip: data.ip,
      wallet: data.wallet,
      max_duration_seconds: data.maxMinutes * 60,
      rate_per_second_atoms: data.ratePerSecondAtoms.toString(),
      delegation_data: data.delegationData,
      fee_collector: data.feeCollector,
      fee_amount_atoms: data.feeAmountAtoms,
      state: 'delegated',
    })
    .select()
    .single();

  if (error) throw new Error(`DB topup insert failed: ${error.message}`);
  return row as TopupSession;
}

export async function getTopupSession(id: string): Promise<TopupSession | null> {
  const { data } = await db().from('topup_sessions').select('*').eq('id', id).single();
  return data as TopupSession | null;
}

export async function getTopupSessionByTaskId(taskId: string): Promise<TopupSession | null> {
  const { data } = await db().from('topup_sessions').select('*').eq('task_id', taskId).single();
  return data as TopupSession | null;
}

export async function startTopupSession(id: string): Promise<TopupSession | null> {
  const { data, error } = await db()
    .from('topup_sessions')
    .update({ state: 'active', start_time: Date.now(), updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('state', 'delegated')
    .select()
    .single();

  if (error || !data) return null;
  return data as TopupSession;
}

export async function markTopupStopping(
  id: string,
  taskId: string,
  actualSeconds: number,
  actualChargedAtoms: string,
): Promise<TopupSession | null> {
  const { data, error } = await db()
    .from('topup_sessions')
    .update({
      state: 'stopping',
      stop_time: Date.now(),
      actual_seconds: actualSeconds,
      actual_charged_atoms: actualChargedAtoms,
      task_id: taskId,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('state', 'active')
    .select()
    .single();

  if (error || !data) return null;
  return data as TopupSession;
}

export async function finalizeTopupSession(taskId: string, txHash: string): Promise<TopupSession | null> {
  const { data, error } = await db()
    .from('topup_sessions')
    .update({ state: 'stopped', transaction_hash: txHash, updated_at: new Date().toISOString() })
    .eq('task_id', taskId)
    .eq('state', 'stopping')
    .select()
    .single();

  if (error || !data) return null;
  return data as TopupSession;
}

export async function expireActiveTopupSessions(): Promise<void> {
  const now = Date.now();
  const { data: activeSessions } = await db()
    .from('topup_sessions')
    .select('id, start_time, max_duration_seconds')
    .eq('state', 'active');

  if (!activeSessions) return;

  for (const s of activeSessions) {
    const expiresAt = (s.start_time as number) + (s.max_duration_seconds as number) * 1000;
    if (now > expiresAt) {
      await db()
        .from('topup_sessions')
        .update({ state: 'expired', stop_time: now, updated_at: new Date().toISOString() })
        .eq('id', s.id);
    }
  }
}
