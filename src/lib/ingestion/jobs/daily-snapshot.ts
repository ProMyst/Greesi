import { getServiceClient } from '../utils/supabase-client';
import { logPipelineRun } from '../utils/logger';

export async function runDailySnapshot(): Promise<void> {
  const startedAt = new Date();
  const db = getServiceClient();
  const today = new Date().toISOString().split('T')[0];

  try {
    const [
      { count: priceTicks },
      { count: macroPoints },
      { count: rssArticles },
      { count: socialMentions },
      { count: signals },
      { count: crossSignals },
      { count: assets },
    ] = await Promise.all([
      db.from('price_ticks').select('*', { count: 'exact', head: true }),
      db.from('macro_data_points').select('*', { count: 'exact', head: true }),
      db.from('rss_articles').select('*', { count: 'exact', head: true }),
      db.from('social_mentions').select('*', { count: 'exact', head: true }),
      db.from('signals').select('*', { count: 'exact', head: true }),
      db.from('signals').select('*', { count: 'exact', head: true }).eq('cross_domain', true),
      db.from('assets').select('*', { count: 'exact', head: true }).eq('is_active', true),
    ]);

    // Success rate from last 24h
    const yesterday = new Date(Date.now() - 86400000).toISOString();
    const { data: recentRuns } = await db
      .from('pipeline_runs')
      .select('status')
      .gte('started_at', yesterday);

    const total = recentRuns?.length ?? 0;
    const succeeded = recentRuns?.filter(r => r.status === 'success').length ?? 0;
    const successRate = total > 0 ? parseFloat(((succeeded / total) * 100).toFixed(2)) : null;

    // Count today's data points
    const todayStart = `${today}T00:00:00Z`;
    const [{ count: ticksToday }, { count: articlesToday }] = await Promise.all([
      db.from('price_ticks').select('*', { count: 'exact', head: true }).gte('fetched_at', todayStart),
      db.from('rss_articles').select('*', { count: 'exact', head: true }).gte('ingested_at', todayStart),
    ]);

    await db.from('dataset_snapshots').upsert({
      snapshot_date:             today,
      total_price_ticks:         priceTicks ?? 0,
      total_macro_points:        macroPoints ?? 0,
      total_rss_articles:        rssArticles ?? 0,
      total_social_mentions:     socialMentions ?? 0,
      total_signals_generated:   signals ?? 0,
      total_cross_domain_signals: crossSignals ?? 0,
      active_assets_tracked:     assets ?? 0,
      active_rss_feeds:          10,
      pipeline_success_rate:     successRate,
      data_points_today:         (ticksToday ?? 0) + (articlesToday ?? 0),
    }, { onConflict: 'snapshot_date' });

    await logPipelineRun({
      job_name: 'daily_snapshot', source: 'computed', status: 'success',
      records_written: 1, latency_ms: Date.now() - startedAt.getTime(),
      started_at: startedAt, completed_at: new Date(),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await logPipelineRun({
      job_name: 'daily_snapshot', source: 'computed', status: 'failed',
      error_message: msg, started_at: startedAt,
    });
    throw err;
  }
}
