export const prerender = false;
import type { APIRoute } from 'astro';
import { runDailySnapshot } from '../../../lib/ingestion/jobs/daily-snapshot';

export const GET: APIRoute = async ({ request }) => {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${import.meta.env.CRON_SECRET}`) {
    return new Response('Unauthorized', { status: 401 });
  }
  try {
    await runDailySnapshot();
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ ok: false, error: msg }), { status: 500 });
  }
};
