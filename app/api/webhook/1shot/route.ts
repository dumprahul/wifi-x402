import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));

  const taskId = body.taskId ?? body.task_id;
  const status = (body.status ?? body.Status ?? '').toLowerCase();
  const txHash = body.txHash ?? body.transactionHash ?? body.transaction_hash;

  console.log(`[Webhook/1Shot] taskId=${taskId} status=${status} tx=${txHash}`);

  // In a full production build: look up session by taskId, activate it, open firewall.
  // For this prototype we just acknowledge receipt.
  return NextResponse.json({ received: true, taskId, status });
}
