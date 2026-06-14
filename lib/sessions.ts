import { db } from './supabase';

export interface Session {
  id: string;
  ip: string;
  mac?: string;
  wallet: string;
  plan_id: string;
  plan_name: string;
  duration_seconds: number;
  paid_usdc: number;
  task_id?: string;
  transaction_hash?: string;
  permissions_context?: object;
  started_at: number;
  expires_at: number;
  status: 'pending' | 'active' | 'expired';
  created_at: string;
}

/** Create a pending session right after payment submission */
export async function createSession(data: {
  ip: string;
  mac?: string;
  wallet: string;
  planId: string;
  planName: string;
  durationSeconds: number;
  paidUsdc: string;
  taskId: string;
  permissionsContext: object;
}): Promise<Session> {
  const now = Date.now();
  const { data: row, error } = await db()
    .from('sessions')
    .insert({
      ip: data.ip,
      mac: data.mac,
      wallet: data.wallet,
      plan_id: data.planId,
      plan_name: data.planName,
      duration_seconds: data.durationSeconds,
      paid_usdc: parseFloat(data.paidUsdc),
      task_id: data.taskId,
      permissions_context: data.permissionsContext,
      started_at: now,
      expires_at: now + data.durationSeconds * 1000,
      status: 'pending',
    })
    .select()
    .single();

  if (error) throw new Error(`DB insert failed: ${error.message}`);
  return row as Session;
}

/** Activate session when 1Shot webhook confirms tx */
export async function activateSession(taskId: string, txHash: string): Promise<Session | null> {
  const { data, error } = await db()
    .from('sessions')
    .update({ status: 'active', transaction_hash: txHash, updated_at: new Date().toISOString() })
    .eq('task_id', taskId)
    .eq('status', 'pending')
    .select()
    .single();

  if (error || !data) return null;
  return data as Session;
}

/** Check if an IP has an active valid session right now */
export async function hasActiveSession(ip: string): Promise<Session | null> {
  const now = Date.now();
  const { data } = await db()
    .from('sessions')
    .select('*')
    .eq('ip', ip)
    .eq('status', 'active')
    .gt('expires_at', now)
    .order('expires_at', { ascending: false })
    .limit(1)
    .single();

  return data as Session | null;
}

/** Expire all sessions whose time has passed */
export async function expireOldSessions(): Promise<number> {
  const now = Date.now();
  const { data, error } = await db()
    .from('sessions')
    .update({ status: 'expired', updated_at: new Date().toISOString() })
    .eq('status', 'active')
    .lt('expires_at', now)
    .select('id');

  if (error) return 0;
  return data?.length ?? 0;
}

/** Get session by task ID */
export async function getSessionByTaskId(taskId: string): Promise<Session | null> {
  const { data } = await db()
    .from('sessions')
    .select('*')
    .eq('task_id', taskId)
    .single();
  return data as Session | null;
}

/** Log a firewall action */
export async function logFirewall(data: {
  sessionId?: string;
  ip: string;
  action: 'allow' | 'block';
  reason: string;
  pfctlOutput?: string;
}) {
  await db().from('firewall_logs').insert({
    session_id: data.sessionId,
    ip: data.ip,
    action: data.action,
    reason: data.reason,
    pfctl_output: data.pfctlOutput,
  });
}
