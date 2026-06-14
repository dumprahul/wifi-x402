import { db } from './supabase';
import { blockIP } from './firewall';

/**
 * Expire sessions whose time has passed and remove their IPs from the pfctl allowlist.
 * Call this on a cron or from the firewall-watcher script.
 */
export async function expireAndBlockStale(): Promise<number> {
  const now = Date.now();

  const { data: expired, error } = await db()
    .from('sessions')
    .update({ status: 'expired', updated_at: new Date().toISOString() })
    .eq('status', 'active')
    .lt('expires_at', now)
    .select('id, ip');

  if (error || !expired?.length) return 0;

  for (const session of expired) {
    await blockIP(session.ip, session.id, 'session_expired').catch(console.error);
    console.log(`[Expiry] Session ${session.id} expired, blocked IP ${session.ip}`);
  }

  return expired.length;
}

/**
 * Returns seconds remaining for the most recent active session for an IP.
 * Returns 0 if no active session exists.
 */
export async function secondsRemaining(ip: string): Promise<number> {
  const { data } = await db()
    .from('sessions')
    .select('expires_at')
    .eq('ip', ip)
    .eq('status', 'active')
    .gt('expires_at', Date.now())
    .order('expires_at', { ascending: false })
    .limit(1)
    .single();

  if (!data) return 0;
  return Math.max(0, Math.floor((data.expires_at - Date.now()) / 1000));
}
