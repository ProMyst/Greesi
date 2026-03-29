import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let _client: SupabaseClient | null = null;

/** Server-side only — uses service role key to bypass RLS for all writes */
export function getServiceClient(): SupabaseClient {
  if (_client) return _client;

  const url = process.env.PUBLIC_SUPABASE_URL ?? import.meta.env.PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY ?? import.meta.env.SUPABASE_SERVICE_KEY;

  if (!url || !key) throw new Error('Missing Supabase env vars');

  _client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return _client;
}
