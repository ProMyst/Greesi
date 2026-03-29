import Parser from 'rss-parser';
import { getServiceClient } from '../utils/supabase-client';
import { logPipelineRun } from '../utils/logger';
import { extractAssets, extractSectors, scoreSentiment, scoreImportance } from '../processors/nlp-extractor';

const parser = new Parser({ timeout: 10000 });

const RSS_FEEDS = [
  // Crypto
  { name: 'CoinDesk',        url: 'https://www.coindesk.com/arc/outboundfeeds/rss/',            weight: 9  },
  { name: 'CoinTelegraph',   url: 'https://cointelegraph.com/rss',                              weight: 8  },
  { name: 'The Block',       url: 'https://www.theblock.co/rss.xml',                            weight: 9  },
  { name: 'Decrypt',         url: 'https://decrypt.co/feed',                                    weight: 7  },
  // Finance / Macro
  { name: 'Reuters Finance', url: 'https://feeds.reuters.com/reuters/businessNews',             weight: 10 },
  { name: 'CNBC Finance',    url: 'https://www.cnbc.com/id/10000664/device/rss/rss.html',       weight: 8  },
  { name: 'Seeking Alpha',   url: 'https://seekingalpha.com/feed.xml',                          weight: 7  },
  // Macro / Official
  { name: 'Fed Reserve',     url: 'https://www.federalreserve.gov/feeds/press_all.xml',         weight: 10 },
  { name: 'SEC Press',       url: 'https://www.sec.gov/cgi-bin/browse-edgar?action=getcurrent&type=&dateb=&owner=include&count=40&search_text=&output=atom', weight: 9 },
  { name: 'FRED Blog',       url: 'https://fredblog.stlouisfed.org/feed/',                      weight: 8  },
];

export async function runRssAggregatorJob(): Promise<{ written: number; skipped: number }> {
  const startedAt = new Date();
  let totalFetched = 0;
  let totalWritten = 0;
  let totalSkipped = 0;

  const db = getServiceClient();
  const inserts: object[] = [];

  for (const feed of RSS_FEEDS) {
    try {
      const parsed = await parser.parseURL(feed.url);
      const items = parsed.items?.slice(0, 20) ?? []; // Max 20 per feed per run
      totalFetched += items.length;

      for (const item of items) {
        const articleUrl = item.link ?? item.guid;
        if (!articleUrl) { totalSkipped++; continue; }

        const title   = item.title ?? '';
        const summary = item.contentSnippet ?? item.content ?? '';
        const text    = `${title} ${summary}`;

        const assets   = extractAssets(text);
        const sectors  = extractSectors(text);
        const sentiment = scoreSentiment(text);
        const importance = scoreImportance(title, feed.weight);

        inserts.push({
          feed_name:        feed.name,
          feed_url:         feed.url,
          article_url:      articleUrl,
          title:            title.slice(0, 500),
          summary:          summary.slice(0, 1000),
          author:           item.creator ?? item.author ?? null,
          published_at:     item.pubDate ? new Date(item.pubDate).toISOString() : null,
          related_assets:   assets,
          related_sectors:  sectors,
          sentiment_score:  sentiment.score,
          sentiment_label:  sentiment.label,
          importance_score: importance,
          raw_payload:      { title: item.title, link: item.link, pubDate: item.pubDate },
          ingested_at:      new Date().toISOString(),
        });
      }
    } catch (feedErr) {
      console.error(`[rss] Failed feed ${feed.name}:`, feedErr);
      totalSkipped++;
    }
  }

  // Bulk insert — deduplicated via UNIQUE(article_url)
  if (inserts.length > 0) {
    const { error } = await db
      .from('rss_articles')
      .upsert(inserts as Parameters<typeof db.from>[0][], {
        onConflict: 'article_url',
        ignoreDuplicates: true,
      });

    if (error) {
      console.error('[rss] DB upsert error:', error.message);
    } else {
      totalWritten = inserts.length;
    }
  }

  const hadFailures = totalSkipped > totalFetched * 0.5;
  await logPipelineRun({
    job_name:        'rss_aggregator',
    source:          'rss_feed',
    status:          hadFailures ? 'partial' : 'success',
    records_fetched: totalFetched,
    records_written: totalWritten,
    records_skipped: totalSkipped,
    api_calls_made:  RSS_FEEDS.length,
    latency_ms:      Date.now() - startedAt.getTime(),
    started_at:      startedAt,
    completed_at:    new Date(),
  });

  return { written: totalWritten, skipped: totalSkipped };
}
