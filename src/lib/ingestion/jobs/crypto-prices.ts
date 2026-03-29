import { getServiceClient } from '../utils/supabase-client';
import { logPipelineRun, checkAndAlertFailures } from '../utils/logger';
import { BinanceTickerSchema } from '../validators/schemas';
import { generateCryptoSignals } from '../processors/signal-generator';

const TRACKED_SYMBOLS = [
  'BTCUSDT','ETHUSDT','SOLUSDT','BNBUSDT',
  'AVAXUSDT','LINKUSDT','UNIUSDT','ADAUSDT',
];

export async function runCryptoPricesJob(): Promise<{ written: number; signals: number }> {
  const startedAt = new Date();
  let recordsFetched = 0;
  let recordsWritten = 0;

  try {
    const db = getServiceClient();

    // Binance 24hr ticker — no key, high rate limit
    const symbolsParam = encodeURIComponent(JSON.stringify(TRACKED_SYMBOLS));
    const res = await fetch(`https://api.binance.com/api/v3/ticker/24hr?symbols=${symbolsParam}`);
    if (!res.ok) throw new Error(`Binance API ${res.status}: ${await res.text()}`);

    const raw = await res.json() as unknown[];
    recordsFetched = raw.length;

    // Get asset ID map
    const { data: assetRows } = await db
      .from('assets')
      .select('id, binance_symbol')
      .eq('asset_class', 'crypto');

    const assetMap = new Map(assetRows?.map(a => [a.binance_symbol, a.id]) ?? []);

    const ticks: Array<{
      symbol: string; price_usd: number;
      price_change_24h: number; volume_24h: number;
    }> = [];

    const inserts = [];
    for (const item of raw) {
      const parsed = BinanceTickerSchema.safeParse(item);
      if (!parsed.success) continue;

      const d = parsed.data;
      const price = parseFloat(d.lastPrice);
      const change24h = parseFloat(d.priceChangePercent);
      const volume24h = parseFloat(d.quoteVolume);
      const assetId = assetMap.get(d.symbol);

      if (!assetId || price <= 0) continue;

      inserts.push({
        asset_id:         assetId,
        price_usd:        price,
        volume_24h:       volume24h,
        price_change_24h: change24h,
        source:           'binance' as const,
        raw_payload:      d,
        fetched_at:       new Date().toISOString(),
      });

      ticks.push({ symbol: d.symbol.replace('USDT',''), price_usd: price, price_change_24h: change24h, volume_24h: volume24h });
    }

    if (inserts.length > 0) {
      const { error } = await db.from('price_ticks').insert(inserts);
      if (error) throw new Error(`DB insert error: ${error.message}`);
      recordsWritten = inserts.length;
    }

    // Generate signals from price data
    const signals = await generateCryptoSignals(ticks);

    await logPipelineRun({
      job_name: 'crypto_prices', source: 'binance', status: 'success',
      records_fetched: recordsFetched, records_written: recordsWritten,
      latency_ms: Date.now() - startedAt.getTime(),
      started_at: startedAt, completed_at: new Date(),
    });

    return { written: recordsWritten, signals };

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await logPipelineRun({
      job_name: 'crypto_prices', source: 'binance', status: 'failed',
      error_message: msg, started_at: startedAt, completed_at: new Date(),
    });
    await checkAndAlertFailures('crypto_prices');
    throw err;
  }
}
