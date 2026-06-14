import { NextRequest, NextResponse } from 'next/server';

// Base Sepolia uses the dev endpoint
const RELAYER_URL = 'https://relayer.1shotapi.dev/relayers';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ taskId: string }> }
) {
  const { taskId } = await params;

  try {
    const res = await fetch(RELAYER_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'relayer_getStatus',
        params: { id: taskId, logs: false },
      }),
    });
    const data = await res.json();
    return NextResponse.json({ taskId, status: data.result, raw: data });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ taskId, status: 'unknown', error: msg }, { status: 502 });
  }
}
