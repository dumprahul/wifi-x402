import { NextRequest, NextResponse } from 'next/server';

/**
 * GET  /api/admin/firewall — list all IPs in pfctl allowlist
 * DELETE /api/admin/firewall — flush entire allowlist
 */

async function getPfctlList(): Promise<string[]> {
  const { exec } = await import('child_process');
  const { promisify } = await import('util');
  const execAsync = promisify(exec);
  const TABLE = process.env.FIREWALL_TABLE || 'wifix402_allowed';
  try {
    const { stdout } = await execAsync(`sudo /usr/sbin/pfctl -t ${TABLE} -T show`);
    return stdout.split('\n').map(s => s.trim()).filter(Boolean);
  } catch {
    return [];
  }
}

async function flushPfctl(): Promise<void> {
  const { exec } = await import('child_process');
  const { promisify } = await import('util');
  const execAsync = promisify(exec);
  const TABLE = process.env.FIREWALL_TABLE || 'wifix402_allowed';
  await execAsync(`sudo /usr/sbin/pfctl -t ${TABLE} -T flush`).catch(() => {});
}

function guard(req: NextRequest): boolean {
  return req.headers.get('x-admin-secret') === process.env.ADMIN_SECRET;
}

export async function GET(req: NextRequest) {
  if (!guard(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const ips = await getPfctlList();
  return NextResponse.json({ allowedIPs: ips, count: ips.length });
}

export async function DELETE(req: NextRequest) {
  if (!guard(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  await flushPfctl();
  return NextResponse.json({ flushed: true });
}
