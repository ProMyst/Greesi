export const prerender = false;
import type { APIRoute } from 'astro';
import { runMacroFredJob } from '../../../lib/ingestion/jobs/macro-fred';

export const GET: APIRoute = async ({ request }) => {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${import.meta.env.CRON_SECRET}`) {
    return new Response('Unauthorized', { status: 401 });
  }
  try {
    const result = await runMacroFredJob();
    return new Response(JSON.stringify({ ok: true, ...result }), { status: 200 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ ok: false, error: msg }), { status: 500 });
  }
};
