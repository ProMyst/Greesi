import type { APIRoute } from 'astro';
import { supabaseAdmin } from '../../lib/supabase';

export const prerender = false;

interface WaitlistBody {
  email: string;
  interest?: string;
  userType?: 'individual' | 'institutional';
}

export const POST: APIRoute = async ({ request }) => {
  let body: WaitlistBody;

  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const { email, interest, userType } = body;

  // Basic validation
  if (!email || typeof email !== 'string' || !email.includes('@')) {
    return new Response(JSON.stringify({ error: 'Valid email required' }), {
      status: 422,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const { error } = await supabaseAdmin.from('waitlist').upsert(
    { email: email.toLowerCase().trim(), interest: interest ?? null, user_type: userType ?? null },
    { onConflict: 'email', ignoreDuplicates: false }
  );

  if (error) {
    console.error('[/api/waitlist POST]', error);
    return new Response(JSON.stringify({ error: 'Failed to save' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  return new Response(JSON.stringify({ success: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};
