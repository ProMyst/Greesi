import type { APIRoute } from 'astro';
import { cachedFetch } from '../../../lib/cache';

export const prerender = false;

interface FredObservation {
  date: string;
  value: string;
}

interface FredResponse {
  observations: FredObservation[];
}

export interface MacroRatesResponse {
  fedFunds:  { value: number; date: string };
  treasury10y: { value: number; date: string };
  cpi:       { value: number; date: string };
  updatedAt: string;
}

async function fetchFredSeries(seriesId: string, apiKey: string): Promise<FredObservation> {
  const url =
    `https://api.stlouisfed.org/fred/series/observations` +
    `?series_id=${seriesId}` +
    `&api_key=${apiKey}` +
    `&file_type=json` +
    `&sort_order=desc` +
    `&limit=1`;

  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`FRED error for ${seriesId}: ${res.status}`);
  const data: FredResponse = await res.json();
  return data.observations[0];
}

async function fetchRates(): Promise<MacroRatesResponse> {
  const apiKey = import.meta.env.FRED_API_KEY;
  if (!apiKey) throw new Error('FRED_API_KEY not set');

  const [fedFunds, treasury10y, cpi] = await Promise.all([
    fetchFredSeries('FEDFUNDS', apiKey),   // Fed Funds Rate (monthly)
    fetchFredSeries('DGS10', apiKey),      // 10-Year Treasury (daily)
    fetchFredSeries('CPIAUCSL', apiKey),   // CPI (monthly)
  ]);

  return {
    fedFunds:    { value: parseFloat(fedFunds.value),    date: fedFunds.date },
    treasury10y: { value: parseFloat(treasury10y.value), date: treasury10y.date },
    cpi:         { value: parseFloat(cpi.value),         date: cpi.date },
    updatedAt: new Date().toISOString(),
  };
}

export const GET: APIRoute = async () => {
  try {
    // Cache 1 hour — FRED data is updated daily at most
    const data = await cachedFetch('macro:rates', fetchRates, 3600);

    return new Response(JSON.stringify(data), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=7200',
      },
    });
  } catch (err) {
    console.error('[/api/macro/rates]', err);
    return new Response(JSON.stringify({ error: 'Failed to fetch macro data' }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
