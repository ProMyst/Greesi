import { createServerClient, parseCookieHeader, serializeCookieHeader } from '@supabase/ssr';
import type { AstroCookies } from 'astro';

const supabaseUrl  = import.meta.env.PUBLIC_SUPABASE_URL as string;
const supabaseAnon = import.meta.env.PUBLIC_SUPABASE_ANON_KEY as string;

/**
 * Creates a Supabase client bound to the current request's cookies.
 * Use in Astro page server scripts and API routes.
 */
export function createSupabaseServerClient(cookies: AstroCookies) {
  return createServerClient(supabaseUrl, supabaseAnon, {
    cookies: {
      getAll() {
        return parseCookieHeader(cookies.toString() ?? '');
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
          cookies.set(name, value, options as Parameters<AstroCookies['set']>[2]);
        });
      },
    },
  });
}

/**
 * Creates a Supabase client for use in middleware (works with Request/Response headers).
 */
export function createSupabaseMiddlewareClient(
  request: Request,
  headers: Headers
) {
  return createServerClient(supabaseUrl, supabaseAnon, {
    cookies: {
      getAll() {
        return parseCookieHeader(request.headers.get('cookie') ?? '');
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
          headers.append(
            'Set-Cookie',
            serializeCookieHeader(name, value, options)
          );
        });
      },
    },
  });
}
