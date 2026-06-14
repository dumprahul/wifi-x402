import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/supabase';

/**
 * GET /api/admin/sessions
 * Returns recent sessions for the hotspot dashboard.
 * Protected by ADMIN_SECRET env var.
 */
export async function GET(req: NextRequest) {
  const secret = req.headers.get('x-admin-secret');
  if (!secret || secret !== process.env.ADMIN_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const limit = Math.min(parseInt(req.nextUrl.searchParams.get('limit') ?? '50'), 200);
  const status = req.nextUrl.searchParams.get('status'); // 'active' | 'pending' | 'expired'

  let query = db()
    .from('sessions')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (status) query = query.eq('status', status);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ sessions: data, count: data?.length ?? 0 });
}
