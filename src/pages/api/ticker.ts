import type { APIRoute } from 'astro';
import { cachedFetch } from '../../lib/cache';

export const prerender = false;

export interface TickerItem {
  label: string;
  value: string;
  change?: string;
  direction: 'up' | 'down' | 'neutral';
  category: 'crypto' | 'macro' | 'finance';
  updatedAt: string;
}

export interface TickerResponse {
  items: TickerItem[];
  updatedAt: string;
}

async function buildTicker(): Promise<TickerResponse> {
  const now = new Date().toISOString();
  const items: TickerItem[] = [];

  // ── Crypto prices (Binance — no key, generous rate limits) ────
  try {
    const symbols = encodeURIComponent(JSON.stringify(['BTCUSDT', 'ETHUSDT', 'SOLUSDT']));
    const cryptoRes = await fetch(
      `https://api.binance.com/api/v3/ticker/24hr?symbols=${symbols}`,
      { headers: { Accept: 'application/json' } }
    );
    if (cryptoRes.ok) {
      const rows: Array<{ symbol: string; lastPrice: string; priceChangePercent: string }> = await cryptoRes.json();
      const fmt = (n: number) => n >= 1000
        ? '$' + n.toLocaleString('en-US', { maximumFractionDigits: 0 })
        : '$' + n.toFixed(2);
      const fmtChange = (n: number) => (n >= 0 ? '+' : '') + n.toFixed(2) + '%';

      for (const [sym, label] of [['BTCUSDT','BTC/USD'],['ETHUSDT','ETH/USD'],['SOLUSDT','SOL/USD']]) {
        const row = rows.find(r => r.symbol === sym);
        if (!row) continue;
        const price  = parseFloat(row.lastPrice);
        const change = parseFloat(row.priceChangePercent);
        items.push({
          label,
          value:     fmt(price),
          change:    fmtChange(change),
          direction: change >= 0.5 ? 'up' : change < -0.5 ? 'down' : 'neutral',
          category:  'crypto',
          updatedAt: now,
        });
      }
    }
  } catch { /* silently degrade */ }

  // ── Macro data (FRED) ──────────────────────────────────────────
  const fredKey = import.meta.env.FRED_API_KEY;
  if (fredKey) {
    try {
      const fetchFred = async (series: string) => {
        const r = await fetch(
          `https://api.stlouisfed.org/fred/series/observations` +
          `?series_id=${series}&api_key=${fredKey}&file_type=json&sort_order=desc&limit=1`
        );
        if (!r.ok) return null;
        const d = await r.json();
        return d.observations?.[0]?.value as string | null;
      };

      const [fedFunds, treasury10y] = await Promise.all([
        fetchFred('FEDFUNDS'),
        fetchFred('DGS10'),
      ]);

      if (fedFunds) items.push({
        label: 'FED FUNDS', value: `${fedFunds}%`,
        direction: 'neutral', category: 'macro', updatedAt: now,
      });
      if (treasury10y) items.push({
        label: '10Y YIELD', value: `${treasury10y}%`,
        direction: 'neutral', category: 'macro', updatedAt: now,
      });
    } catch { /* silently degrade */ }
  }

  // ── Fallback static items (always shown) ──────────────────────
  items.push(
    { label: 'WEALTHFRONT', value: '4.80% APY', direction: 'up',     category: 'finance', updatedAt: now },
    { label: 'MARCUS',      value: '4.40% APY', direction: 'up',     category: 'finance', updatedAt: now },
    { label: 'CSP BONUS',   value: '80,000 pts', direction: 'up',    category: 'finance', updatedAt: now },
    { label: 'AMEX PLAT',   value: '150k expired', direction: 'down', category: 'finance', updatedAt: now },
  );

  return { items, updatedAt: now };
}

export const GET: APIRoute = async () => {
  try {
    const data = await cachedFetch('ticker', buildTicker, 90);

    return new Response(JSON.stringify(data), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, s-maxage=90, stale-while-revalidate=180',
      },
    });
  } catch (err) {
    console.error('[/api/ticker]', err);
    return new Response(JSON.stringify({ error: 'Failed to build ticker' }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
