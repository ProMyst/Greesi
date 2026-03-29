import { getServiceClient } from './supabase-client';

export interface PipelineRunLog {
  job_name: string;
  source: string;
  status: 'success' | 'partial' | 'failed' | 'skipped';
  records_fetched?: number;
  records_written?: number;
  records_skipped?: number;
  records_failed?: number;
  latency_ms?: number;
  error_message?: string;
  api_calls_made?: number;
  rate_limit_hit?: boolean;
  started_at: Date;
  completed_at?: Date;
}

export async function logPipelineRun(log: PipelineRunLog): Promise<void> {
  try {
    const db = getServiceClient();
    await db.from('pipeline_runs').insert({
      job_name:        log.job_name,
      source:          log.source,
      status:          log.status,
      records_fetched: log.records_fetched ?? 0,
      records_written: log.records_written ?? 0,
      records_skipped: log.records_skipped ?? 0,
      records_failed:  log.records_failed ?? 0,
      latency_ms:      log.latency_ms,
      error_message:   log.error_message,
      api_calls_made:  log.api_calls_made ?? 1,
      rate_limit_hit:  log.rate_limit_hit ?? false,
      started_at:      log.started_at.toISOString(),
      completed_at:    (log.completed_at ?? new Date()).toISOString(),
    });
  } catch {
    // Logging should never crash the job
    console.error('[logger] Failed to write pipeline_run');
  }
}

/** Returns the last N runs for a given job */
export async function getRecentRuns(jobName: string, limit = 5) {
  const db = getServiceClient();
  const { data } = await db
    .from('pipeline_runs')
    .select('status, latency_ms, records_written, started_at, error_message')
    .eq('job_name', jobName)
    .order('started_at', { ascending: false })
    .limit(limit);
  return data ?? [];
}

/** Check last 3 runs — if all failed, we could alert (stub for Resend later) */
export async function checkAndAlertFailures(jobName: string): Promise<void> {
  const runs = await getRecentRuns(jobName, 3);
  if (runs.length >= 3 && runs.every(r => r.status === 'failed')) {
    console.error(`[ALERT] ${jobName} has failed 3 consecutive times`);
    // TODO: send Resend email alert
  }
}
