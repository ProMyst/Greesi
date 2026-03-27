import type { APIRoute } from 'astro';
import { supabase } from '../../../lib/supabase';
import { cachedFetch } from '../../../lib/cache';

export const prerender = false;

export interface FeaturedSignal {
  id: string;
  domain: string;
  type: string;
  title: string;
  body: string | null;
  metric_label: string | null;
  metric_value: string | null;
  direction: 'bullish' | 'bearish' | 'neutral';
  strength: number;
  source_url: string | null;
  created_at: string;
}

async function fetchFeatured(): Promise<FeaturedSignal[]> {
  const { data, error } = await supabase
    .from('signals')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(3);

  if (error) throw error;
  return (data ?? []) as FeaturedSignal[];
}

export const GET: APIRoute = async () => {
  try {
    const signals = await cachedFetch('signals:featured', fetchFeatured, 300);

    return new Response(JSON.stringify({ signals, updatedAt: new Date().toISOString() }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600',
      },
    });
  } catch (err) {
    console.error('[/api/signals/featured]', err);
    return new Response(JSON.stringify({ signals: [], updatedAt: new Date().toISOString() }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
