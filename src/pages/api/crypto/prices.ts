import type { APIRoute } from 'astro';
import { cachedFetch } from '../../../lib/cache';

export const prerender = false;

interface CoinGeckoPrice {
  usd: number;
  usd_24h_change: number;
  usd_market_cap: number;
  usd_24h_vol: number;
}

interface CoinGeckoResponse {
  bitcoin: CoinGeckoPrice;
  ethereum: CoinGeckoPrice;
  solana: CoinGeckoPrice;
}

export interface CryptoPricesResponse {
  prices: {
    BTC: { price: number; change24h: number; marketCap: number };
    ETH: { price: number; change24h: number; marketCap: number };
    SOL: { price: number; change24h: number; marketCap: number };
  };
  updatedAt: string;
}

async function fetchPrices(): Promise<CryptoPricesResponse> {
  const url =
    'https://api.coingecko.com/api/v3/simple/price' +
    '?ids=bitcoin,ethereum,solana' +
    '&vs_currencies=usd' +
    '&include_market_cap=true' +
    '&include_24hr_vol=true' +
    '&include_24hr_change=true';

  const res = await fetch(url, {
    headers: { Accept: 'application/json' },
  });

  if (!res.ok) throw new Error(`CoinGecko error: ${res.status}`);
  const data: CoinGeckoResponse = await res.json();

  return {
    prices: {
      BTC: {
        price:     Math.round(data.bitcoin.usd),
        change24h: parseFloat(data.bitcoin.usd_24h_change.toFixed(2)),
        marketCap: data.bitcoin.usd_market_cap,
      },
      ETH: {
        price:     Math.round(data.ethereum.usd),
        change24h: parseFloat(data.ethereum.usd_24h_change.toFixed(2)),
        marketCap: data.ethereum.usd_market_cap,
      },
      SOL: {
        price:     parseFloat(data.solana.usd.toFixed(2)),
        change24h: parseFloat(data.solana.usd_24h_change.toFixed(2)),
        marketCap: data.solana.usd_market_cap,
      },
    },
    updatedAt: new Date().toISOString(),
  };
}

export const GET: APIRoute = async () => {
  try {
    // Cache 60 seconds — CoinGecko free tier allows ~30 req/min
    const data = await cachedFetch('crypto:prices', fetchPrices, 60);

    return new Response(JSON.stringify(data), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
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
