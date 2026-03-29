import { getServiceClient } from '../utils/supabase-client';
import type { SignalInput } from '../validators/schemas';

export async function writeSignal(signal: SignalInput): Promise<void> {
  const db = getServiceClient();
  await db.from('signals').insert({
    ...signal,
    source_table: signal.signal_type,
    updated_at: new Date().toISOString(),
  });
}

interface PriceTickData {
  symbol:           string;
  price_usd:        number;
  price_change_24h: number;
  volume_24h:       number;
}

/** Generate signals from a batch of price ticks */
export async function generateCryptoSignals(ticks: PriceTickData[]): Promise<number> {
  let generated = 0;

  for (const tick of ticks) {
    const change = tick.price_change_24h;
    const absChange = Math.abs(change);

    // Major price move: > 10%
    if (absChange > 10) {
      const direction = change > 0 ? 'bullish' : 'bearish';
      const strength = absChange > 20 ? 5 : absChange > 15 ? 4 : 3;
      await writeSignal({
        domain:           'crypto',
        signal_type:      'price_move',
        direction,
        strength,
        title:            `${tick.symbol} ${change > 0 ? 'Surges' : 'Drops'} ${absChange.toFixed(1)}% in 24H`,
        summary:          `${tick.symbol} has moved ${change > 0 ? '+' : ''}${change.toFixed(2)}% in the past 24 hours to $${tick.price_usd.toLocaleString()}. ${absChange > 15 ? 'Significant momentum shift detected.' : 'Notable move above typical volatility range.'}`,
        metric_label:     `${tick.symbol}/USD 24h`,
        metric_value:     `${change > 0 ? '+' : ''}${change.toFixed(2)}%`,
        metric_raw:       change,
        related_assets:   [tick.symbol],
        confidence_score: 0.85,
      });
      generated++;
    }

    // Volume spike handled by monitoring job separately
  }
  return generated;
}

/** Generate signal from FRED macro data */
export async function generateMacroSignal(
  seriesId: string,
  seriesName: string,
  value: number,
  prevValue: number | null
): Promise<void> {
  if (!prevValue) return;

  const change = ((value - prevValue) / Math.abs(prevValue)) * 100;

  // VIX spike
  if (seriesId === 'VIXCLS' && change > 20) {
    await writeSignal({
      domain:           'macro',
      signal_type:      'macro_event',
      direction:        'bearish',
      strength:         change > 35 ? 5 : 4,
      title:            `VIX Spikes ${change.toFixed(1)}% — Volatility Regime Shift`,
      summary:          `The CBOE Volatility Index surged ${change.toFixed(1)}% to ${value.toFixed(2)}, signaling elevated market uncertainty. Historically, VIX spikes of this magnitude coincide with risk-off positioning in crypto and equities.`,
      metric_label:     'VIX',
      metric_value:     value.toFixed(2),
      metric_raw:       value,
      related_assets:   [],
      confidence_score: 0.88,
    });
  }

  // Yield curve inversion
  if (seriesId === 'T10Y2Y' && value < 0) {
    await writeSignal({
      domain:           'macro',
      signal_type:      'rate_move',
      direction:        'bearish',
      strength:         value < -0.5 ? 5 : value < -0.25 ? 4 : 3,
      title:            `Yield Curve Inverted at ${value.toFixed(2)}% — Recession Watch`,
      summary:          `The 10Y-2Y Treasury spread stands at ${value.toFixed(2)}%, a classic recession indicator. Inversions of this depth have preceded every US recession in the past 50 years, typically by 12-18 months.`,
      metric_label:     '10Y-2Y Spread',
      metric_value:     `${value.toFixed(2)}%`,
      metric_raw:       value,
      related_assets:   [],
      confidence_score: 0.9,
    });
  }
}
