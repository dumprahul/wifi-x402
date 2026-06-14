import { exec } from 'child_process';
import { promisify } from 'util';
import { logFirewall } from './sessions';

const execAsync = promisify(exec);
const TABLE = process.env.FIREWALL_TABLE || 'wifix402_allowed';
const PFCTL = '/usr/sbin/pfctl';
const EXEC_TIMEOUT_MS = 4000; // abort pfctl if it hangs (e.g. sudo waiting for TTY)

/** Add IP to PF table → grants internet access */
export async function allowIP(ip: string, sessionId?: string, reason = 'payment_confirmed'): Promise<string> {
  let output = '';
  try {
    const { stdout, stderr } = await execAsync(`sudo ${PFCTL} -t ${TABLE} -T add ${ip}`, { timeout: EXEC_TIMEOUT_MS });
    output = stdout || stderr;
    console.log(`[Firewall] ALLOW ${ip}: ${output}`);
  } catch (err: unknown) {
    // pfctl not available in dev — simulate
    output = `[simulated] pfctl -t ${TABLE} -T add ${ip}`;
    console.log(`[Firewall] SIMULATED ALLOW ${ip}`);
  }
  await logFirewall({ sessionId, ip, action: 'allow', reason, pfctlOutput: output });
  return output;
}

/** Remove IP from PF table → revokes internet access */
export async function blockIP(ip: string, sessionId?: string, reason = 'session_expired'): Promise<string> {
  let output = '';
  try {
    const { stdout, stderr } = await execAsync(`sudo ${PFCTL} -t ${TABLE} -T delete ${ip}`, { timeout: EXEC_TIMEOUT_MS });
    output = stdout || stderr;
    console.log(`[Firewall] BLOCK ${ip}: ${output}`);
  } catch (err: unknown) {
    output = `[simulated] pfctl -t ${TABLE} -T delete ${ip}`;
    console.log(`[Firewall] SIMULATED BLOCK ${ip}`);
  }
  await logFirewall({ sessionId, ip, action: 'block', reason, pfctlOutput: output });
  return output;
}

/** Check if IP is currently in the allow table */
export async function isAllowed(ip: string): Promise<boolean> {
  try {
    const { stdout } = await execAsync(`sudo ${PFCTL} -t ${TABLE} -T show`, { timeout: EXEC_TIMEOUT_MS });
    return stdout.split('\n').map(l => l.trim()).includes(ip);
  } catch {
    return false;
  }
}
