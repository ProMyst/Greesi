export const prerender = false;
import type { APIRoute } from 'astro';
import { runCryptoPricesJob } from '../../../lib/ingestion/jobs/crypto-prices';

export const GET: APIRoute = async ({ request }) => {
  // Verify Vercel cron secret
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${import.meta.env.CRON_SECRET}`) {
    return new Response('Unauthorized', { status: 401 });
  }
  try {
    const result = await runCryptoPricesJob();
    return new Response(JSON.stringify({ ok: true, ...result }), { status: 200 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ ok: false, error: msg }), { status: 500 });
  }
};
