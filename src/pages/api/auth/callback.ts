export const prerender = false;

import type { APIRoute } from 'astro';
import { createSupabaseServerClient } from '../../../lib/supabase-server';

export const GET: APIRoute = async ({ url, cookies, redirect }) => {
  const code = url.searchParams.get('code');
  const next = url.searchParams.get('next') || '/dashboard';

  if (code) {
    const supabase = createSupabaseServerClient(cookies);
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      return redirect(`/login?error=${encodeURIComponent(error.message)}`);
    }
  }

  return redirect(next);
};
