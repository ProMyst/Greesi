export const prerender = false;

import type { APIRoute } from 'astro';

const VPS_API = 'http://157.230.62.53:8080';

export const GET: APIRoute = async () => {
  try {
    const res = await fetch(`${VPS_API}/api/status`, {
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) throw new Error(`VPS returned ${res.status}`);
    const data = await res.json();
    return new Response(JSON.stringify(data), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: 'VPS unreachable', detail: String(e) }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
