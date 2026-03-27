import type { APIRoute } from 'astro';

export const prerender = false;

export interface CryptoPricesResponse {
  prices: {
    BTC: { price: number; change24h: number };
    ETH: { price: number; change24h: number };
    SOL: { price: number; change24h: number };
  };
  updatedAt: string;
}

// Binance public API — no key, generous rate limits
async function fetchPrices(): Promise<CryptoPricesResponse> {
  const symbols = encodeURIComponent(JSON.stringify(['BTCUSDT', 'ETHUSDT', 'SOLUSDT']));
  const res = await fetch(
    `https://api.binance.com/api/v3/ticker/24hr?symbols=${symbols}`,
    { headers: { Accept: 'application/json' } }
  );
  if (!res.ok) throw new Error(`Binance error: ${res.status}`);

  const data: Array<{ symbol: string; lastPrice: string; priceChangePercent: string }> = await res.json();

  const get = (sym: string) => {
    const row = data.find(d => d.symbol === sym);
    if (!row) throw new Error(`Symbol ${sym} not found`);
    return {
      price:     parseFloat(parseFloat(row.lastPrice).toFixed(2)),
      change24h: parseFloat(parseFloat(row.priceChangePercent).toFixed(2)),
    };
  };

  return {
    prices: { BTC: get('BTCUSDT'), ETH: get('ETHUSDT'), SOL: get('SOLUSDT') },
    updatedAt: new Date().toISOString(),
  };
}

export const GET: APIRoute = async () => {
  try {
    const data = await fetchPrices();
    return new Response(JSON.stringify(data), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        // Vercel edge cache — 60s fresh, 120s stale-while-revalidate
        'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120',
      },
    });
  } catch (err) {
    console.error('[/api/crypto/prices]', err);
    return new Response(JSON.stringify({ error: 'Failed to fetch prices' }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
