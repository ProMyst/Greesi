import { getServiceClient } from '../utils/supabase-client';
import { logPipelineRun, checkAndAlertFailures } from '../utils/logger';
import { MacroDataPointSchema } from '../validators/schemas';
import { generateMacroSignal } from '../processors/signal-generator';

const FRED_SERIES = [
  { id: 'DFF',        name: 'Fed Funds Rate (Daily)',      unit: 'Percent' },
  { id: 'T10Y2Y',     name: '10Y-2Y Treasury Spread',      unit: 'Percent' },
  { id: 'GS10',       name: '10-Year Treasury Rate',        unit: 'Percent' },
  { id: 'GS2',        name: '2-Year Treasury Rate',         unit: 'Percent' },
  { id: 'VIXCLS',     name: 'CBOE VIX',                    unit: 'Index'   },
  { id: 'CPIAUCSL',   name: 'CPI All Urban Consumers',      unit: 'Index 1982-84=100' },
  { id: 'PCEPILFE',   name: 'Core PCE Price Index',         unit: 'Index 2017=100' },
  { id: 'UNRATE',     name: 'Unemployment Rate',            unit: 'Percent' },
  { id: 'M2SL',       name: 'M2 Money Supply',              unit: 'Billions of Dollars' },
  { id: 'BAMLH0A0HYM2', name: 'High Yield Spread',         unit: 'Percent' },
];

async function fetchFredSeries(apiKey: string, seriesId: string) {
  const url = `https://api.stlouisfed.org/fred/series/observations` +
    `?series_id=${seriesId}&api_key=${apiKey}&file_type=json&sort_order=desc&limit=5`;
  const res = await fetch(url);
  if (res.status === 429) throw new Error('FRED rate limit hit');
  if (!res.ok) throw new Error(`FRED API ${res.status} for ${seriesId}`);
  const data = await res.json() as { observations?: Array<{ date: string; value: string }> };
  return data.observations ?? [];
}

export async function runMacroFredJob(): Promise<{ written: number }> {
  const startedAt = new Date();
  const fredKey = process.env.FRED_API_KEY ?? import.meta.env.FRED_API_KEY;

  if (!fredKey) {
    await logPipelineRun({
      job_name: 'macro_fred', source: 'fred', status: 'skipped',
      error_message: 'FRED_API_KEY not set', started_at: startedAt,
    });
    return { written: 0 };
  }

  let recordsFetched = 0;
  let recordsWritten = 0;
  let recordsSkipped = 0;

  try {
    const db = getServiceClient();

    for (const series of FRED_SERIES) {
      try {
        const observations = await fetchFredSeries(fredKey, series.id);
        recordsFetched += observations.length;

        // Get previous value for signal generation
        const prevObs = observations[1];
        const prevValue = prevObs && prevObs.value !== '.' ? parseFloat(prevObs.value) : null;

        for (const obs of observations) {
          if (obs.value === '.') { recordsSkipped++; continue; }

          const value = parseFloat(obs.value);

          const parsed = MacroDataPointSchema.safeParse({
            series_id:        series.id,
            series_name:      series.name,
            value,
            unit:             series.unit,
            observation_date: obs.date,
            vintage_date:     new Date().toISOString().split('T')[0],
          });

          if (!parsed.success) { recordsSkipped++; continue; }

          const { error } = await db.from('macro_data_points').upsert(parsed.data, {
            onConflict: 'series_id,observation_date,vintage_date',
            ignoreDuplicates: true,
          });

          if (!error) {
            recordsWritten++;
            // Generate signal only for the most recent observation
            if (obs === observations[0]) {
              await generateMacroSignal(series.id, series.name, value, prevValue);
            }
          }
        }

        // Small delay to respect FRED rate limits (120 calls/min free tier)
        await new Promise(r => setTimeout(r, 600));
      } catch (seriesErr) {
        console.error(`[macro_fred] Failed series ${series.id}:`, seriesErr);
      }
    }

    await logPipelineRun({
      job_name: 'macro_fred', source: 'fred', status: 'success',
      records_fetched: recordsFetched, records_written: recordsWritten,
      records_skipped: recordsSkipped, api_calls_made: FRED_SERIES.length,
      latency_ms: Date.now() - startedAt.getTime(),
      started_at: startedAt, completed_at: new Date(),
    });

    return { written: recordsWritten };

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await logPipelineRun({
      job_name: 'macro_fred', source: 'fred', status: 'failed',
      error_message: msg, started_at: startedAt, completed_at: new Date(),
    });
    await checkAndAlertFailures('macro_fred');
    throw err;
  }
}
