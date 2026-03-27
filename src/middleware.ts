import { defineMiddleware } from 'astro:middleware';
import { createSupabaseMiddlewareClient } from './lib/supabase-server';

// Routes that require authentication
const PROTECTED = ['/dashboard'];

export const onRequest = defineMiddleware(async (context, next) => {
  const { request, redirect, url } = context;
  const pathname = url.pathname;

  const isProtected = PROTECTED.some(p => pathname === p || pathname.startsWith(p + '/'));
  if (!isProtected) return next();

  const responseHeaders = new Headers();
  const supabase = createSupabaseMiddlewareClient(request, responseHeaders);

  const { data: { session } } = await supabase.auth.getSession();

  if (!session) {
    const loginUrl = new URL('/login', url.origin);
    loginUrl.searchParams.set('next', pathname);
    return redirect(loginUrl.toString());
  }

  const response = await next();

  // Forward any Set-Cookie headers from Supabase SSR
  responseHeaders.forEach((value, key) => {
    response.headers.append(key, value);
  });

  return response;
});
