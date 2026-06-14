import { createClient, SupabaseClient } from '@supabase/supabase-js';

let _admin: SupabaseClient | null = null;
let _anon: SupabaseClient | null = null;

export const supabaseAdmin: SupabaseClient = new Proxy({} as SupabaseClient, {
  get(_, prop) {
    if (!_admin) {
      const url = process.env.SUPABASE_URL;
      const key = process.env.SUPABASE_SERVICE_KEY;
      if (!url || !key) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_KEY are required');
      _admin = createClient(url, key, { auth: { persistSession: false } });
    }
    return (_admin as unknown as Record<string | symbol, unknown>)[prop];
  },
});

export const supabase: SupabaseClient = new Proxy({} as SupabaseClient, {
  get(_, prop) {
    if (!_anon) {
      const url = process.env.SUPABASE_URL;
      const key = process.env.SUPABASE_ANON_KEY;
      if (!url || !key) throw new Error('SUPABASE_URL and SUPABASE_ANON_KEY are required');
      _anon = createClient(url, key);
    }
    return (_anon as unknown as Record<string | symbol, unknown>)[prop];
  },
});
