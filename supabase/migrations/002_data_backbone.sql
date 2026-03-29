-- ============================================================
-- GREESI DATA BACKBONE — Migration 002
-- Run this in Supabase SQL Editor
-- ============================================================

-- Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
-- NOTE: vector extension requires pgvector — enable in Supabase Dashboard
-- under Database > Extensions before uncommenting:
-- CREATE EXTENSION IF NOT EXISTS "vector";

-- ============================================================
-- ENUM TYPES
-- ============================================================
DO $$ BEGIN
  CREATE TYPE signal_domain AS ENUM ('crypto','trends','macro','alt_data','finance','cross_domain');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE signal_direction AS ENUM ('bullish','bearish','neutral','watch');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE signal_strength_type AS ENUM ('1','2','3','4','5');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE asset_class AS ENUM ('crypto','equity','commodity','fx','bond','index','other');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE data_source AS ENUM (
    'binance','coingecko','etherscan','mempool','fred','us_treasury',
    'reddit','google_trends','rss_feed','sec_edgar',
    'indeed','similarweb','manual','computed'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE pipeline_status AS ENUM ('success','partial','failed','skipped');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE user_type_enum AS ENUM ('individual','institutional','developer','internal');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================
-- ASSETS — master list of every tracked asset
-- ============================================================
CREATE TABLE IF NOT EXISTS assets (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  symbol        text NOT NULL,
  name          text NOT NULL,
  asset_class   asset_class NOT NULL,
  domain        signal_domain NOT NULL,
  coingecko_id  text,
  fred_series   text,
  binance_symbol text,
  is_active     boolean DEFAULT true,
  metadata      jsonb DEFAULT '{}',
  created_at    timestamptz DEFAULT now(),
  updated_at    timestamptz DEFAULT now(),
  UNIQUE(symbol, asset_class)
);

-- Seed core assets
INSERT INTO assets (symbol, name, asset_class, domain, binance_symbol, coingecko_id) VALUES
  ('BTC',  'Bitcoin',           'crypto', 'crypto', 'BTCUSDT',  'bitcoin'),
  ('ETH',  'Ethereum',          'crypto', 'crypto', 'ETHUSDT',  'ethereum'),
  ('SOL',  'Solana',            'crypto', 'crypto', 'SOLUSDT',  'solana'),
  ('BNB',  'BNB',               'crypto', 'crypto', 'BNBUSDT',  'binancecoin'),
  ('AVAX', 'Avalanche',         'crypto', 'crypto', 'AVAXUSDT', 'avalanche-2'),
  ('LINK', 'Chainlink',         'crypto', 'crypto', 'LINKUSDT', 'chainlink'),
  ('UNI',  'Uniswap',           'crypto', 'crypto', 'UNIUSDT',  'uniswap'),
  ('DFF',  'Fed Funds Daily',   'bond',   'macro',  NULL,        NULL),
  ('T10Y2Y','10Y-2Y Yield Spread','bond', 'macro',  NULL,        NULL),
  ('VIXCLS','CBOE VIX',         'index',  'macro',  NULL,        NULL),
  ('M2SL', 'M2 Money Supply',   'index',  'macro',  NULL,        NULL)
ON CONFLICT (symbol, asset_class) DO NOTHING;

-- ============================================================
-- PRICE TICKS — every tick stored permanently (training data)
-- ============================================================
CREATE TABLE IF NOT EXISTS price_ticks (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id            uuid NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  price_usd           numeric(20,8) NOT NULL,
  volume_24h          numeric(30,2),
  market_cap          numeric(30,2),
  price_change_1h     numeric(10,4),
  price_change_24h    numeric(10,4),
  price_change_7d     numeric(10,4),
  source              data_source NOT NULL DEFAULT 'binance',
  raw_payload         jsonb,
  fetched_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT valid_price CHECK (price_usd > 0)
);

CREATE INDEX IF NOT EXISTS idx_price_ticks_asset_time ON price_ticks(asset_id, fetched_at DESC);
CREATE INDEX IF NOT EXISTS idx_price_ticks_fetched    ON price_ticks(fetched_at DESC);

-- ============================================================
-- MACRO DATA POINTS — FRED series with full history
-- ============================================================
CREATE TABLE IF NOT EXISTS macro_data_points (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  series_id        text NOT NULL,
  series_name      text NOT NULL,
  value            numeric(20,6) NOT NULL,
  unit             text,
  observation_date date NOT NULL,
  vintage_date     date,
  source           data_source DEFAULT 'fred',
  raw_payload      jsonb,
  fetched_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE(series_id, observation_date, vintage_date)
);

CREATE INDEX IF NOT EXISTS idx_macro_series_date ON macro_data_points(series_id, observation_date DESC);

-- ============================================================
-- RSS ARTICLES — every article from every feed
-- ============================================================
CREATE TABLE IF NOT EXISTS rss_articles (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  feed_name       text NOT NULL,
  feed_url        text NOT NULL,
  article_url     text NOT NULL UNIQUE,
  title           text NOT NULL,
  summary         text,
  author          text,
  published_at    timestamptz,
  related_assets  text[],
  related_sectors text[],
  tags            text[],
  sentiment_score numeric(4,3),
  sentiment_label text,
  importance_score integer,
  raw_payload     jsonb,
  ingested_at     timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rss_published   ON rss_articles(published_at DESC);
CREATE INDEX IF NOT EXISTS idx_rss_feed        ON rss_articles(feed_name, published_at DESC);
CREATE INDEX IF NOT EXISTS idx_rss_assets      ON rss_articles USING GIN(related_assets);
CREATE INDEX IF NOT EXISTS idx_rss_title_search ON rss_articles USING GIN(title gin_trgm_ops);

-- ============================================================
-- SOCIAL MENTIONS — Reddit, Google Trends
-- ============================================================
CREATE TABLE IF NOT EXISTS social_mentions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  platform        text NOT NULL,
  subreddit       text,
  topic           text NOT NULL,
  related_assets  text[],
  related_sectors text[],
  mention_count   integer,
  upvotes         integer,
  comments        integer,
  sentiment_score numeric(4,3),
  sentiment_label text,
  velocity_score  numeric(6,2),
  search_index    integer,
  source          data_source NOT NULL,
  source_url      text,
  raw_payload     jsonb,
  captured_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_social_topic_time ON social_mentions(topic, captured_at DESC);
CREATE INDEX IF NOT EXISTS idx_social_platform   ON social_mentions(platform, captured_at DESC);
CREATE INDEX IF NOT EXISTS idx_social_assets     ON social_mentions USING GIN(related_assets);

-- ============================================================
-- SIGNALS — the intelligence layer (computed from raw data)
-- ============================================================
DROP TABLE IF EXISTS signals CASCADE;
CREATE TABLE signals (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  domain           signal_domain NOT NULL,
  signal_type      text NOT NULL,
  direction        signal_direction NOT NULL,
  strength         integer NOT NULL CHECK (strength BETWEEN 1 AND 5),
  title            text NOT NULL,
  summary          text NOT NULL,
  body             text,
  metric_label     text,
  metric_value     text,
  metric_raw       numeric(20,8),
  related_assets   text[],
  related_sectors  text[],
  source_table     text,
  source_ids       uuid[],
  source_urls      text[],
  confidence_score numeric(4,3),
  cross_domain     boolean DEFAULT false,
  domains_involved text[],
  is_featured      boolean DEFAULT false,
  is_active        boolean DEFAULT true,
  expires_at       timestamptz,
  outcome_tracked  boolean DEFAULT false,
  outcome_value    numeric(20,8),
  outcome_date     timestamptz,
  created_at       timestamptz DEFAULT now(),
  updated_at       timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_signals_domain_time  ON signals(domain, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_signals_strength     ON signals(strength DESC, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_signals_featured     ON signals(is_featured, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_signals_cross_domain ON signals(cross_domain, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_signals_assets       ON signals USING GIN(related_assets);

-- ============================================================
-- PIPELINE RUNS — every job logs here
-- ============================================================
CREATE TABLE IF NOT EXISTS pipeline_runs (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_name         text NOT NULL,
  source           data_source NOT NULL,
  status           pipeline_status NOT NULL,
  records_fetched  integer DEFAULT 0,
  records_written  integer DEFAULT 0,
  records_skipped  integer DEFAULT 0,
  records_failed   integer DEFAULT 0,
  latency_ms       integer,
  error_message    text,
  api_calls_made   integer DEFAULT 1,
  rate_limit_hit   boolean DEFAULT false,
  started_at       timestamptz NOT NULL DEFAULT now(),
  completed_at     timestamptz
);

CREATE INDEX IF NOT EXISTS idx_pipeline_job_time ON pipeline_runs(job_name, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_pipeline_status   ON pipeline_runs(status, started_at DESC);

-- ============================================================
-- DATASET SNAPSHOTS — daily dataset size (valuation evidence)
-- ============================================================
CREATE TABLE IF NOT EXISTS dataset_snapshots (
  id                         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_date              date NOT NULL UNIQUE,
  total_price_ticks          bigint DEFAULT 0,
  total_macro_points         bigint DEFAULT 0,
  total_social_mentions      bigint DEFAULT 0,
  total_rss_articles         bigint DEFAULT 0,
  total_signals_generated    bigint DEFAULT 0,
  total_cross_domain_signals bigint DEFAULT 0,
  active_assets_tracked      integer DEFAULT 0,
  active_rss_feeds           integer DEFAULT 0,
  pipeline_success_rate      numeric(5,2),
  data_points_today          bigint DEFAULT 0,
  created_at                 timestamptz DEFAULT now()
);

-- ============================================================
-- WAITLIST — upgrade from old schema
-- ============================================================
ALTER TABLE IF EXISTS waitlist
  ADD COLUMN IF NOT EXISTS first_name      text,
  ADD COLUMN IF NOT EXISTS referral_source text,
  ADD COLUMN IF NOT EXISTS utm_source      text,
  ADD COLUMN IF NOT EXISTS utm_medium      text,
  ADD COLUMN IF NOT EXISTS utm_campaign    text,
  ADD COLUMN IF NOT EXISTS ip_country      text,
  ADD COLUMN IF NOT EXISTS is_approved     boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS approved_at     timestamptz;

-- ============================================================
-- RLS POLICIES
-- ============================================================
ALTER TABLE assets            ENABLE ROW LEVEL SECURITY;
ALTER TABLE price_ticks       ENABLE ROW LEVEL SECURITY;
ALTER TABLE macro_data_points ENABLE ROW LEVEL SECURITY;
ALTER TABLE rss_articles      ENABLE ROW LEVEL SECURITY;
ALTER TABLE social_mentions   ENABLE ROW LEVEL SECURITY;
ALTER TABLE signals           ENABLE ROW LEVEL SECURITY;
ALTER TABLE pipeline_runs     ENABLE ROW LEVEL SECURITY;
ALTER TABLE dataset_snapshots ENABLE ROW LEVEL SECURITY;

-- Public read policies (no auth needed for these)
CREATE POLICY "Public read signals"          ON signals          FOR SELECT USING (is_active = true);
CREATE POLICY "Public read assets"           ON assets           FOR SELECT USING (is_active = true);
CREATE POLICY "Public read rss_articles"     ON rss_articles     FOR SELECT USING (true);
CREATE POLICY "Public read macro_data"       ON macro_data_points FOR SELECT USING (true);
CREATE POLICY "Public read price_ticks"      ON price_ticks      FOR SELECT USING (true);
CREATE POLICY "Public read pipeline_runs"    ON pipeline_runs    FOR SELECT USING (true);
CREATE POLICY "Public read dataset_snapshots" ON dataset_snapshots FOR SELECT USING (true);
CREATE POLICY "Public read social_mentions"  ON social_mentions  FOR SELECT USING (true);

-- Seed a few starter signals so the dashboard isn't empty
INSERT INTO signals (domain, signal_type, direction, strength, title, summary, metric_label, metric_value, related_assets, is_featured, confidence_score) VALUES
  ('crypto', 'momentum', 'bullish', 4, 'BTC Holding Key Support at $95K', 'Bitcoin has held the $95,000 level for 72 consecutive hours despite elevated macro uncertainty. On-chain data shows strong holder conviction with low exchange inflows.', 'BTC/USD', '$95,200', ARRAY['BTC'], true, 0.78),
  ('macro', 'rate_move', 'neutral', 3, 'Fed Funds Rate Unchanged at 4.25–4.50%', 'The Federal Reserve held rates steady at the March FOMC meeting. Markets pricing 2 cuts by year-end, down from 3 cuts priced in January.', 'Fed Funds Rate', '4.33%', ARRAY[]::text[], true, 0.92),
  ('trends', 'trend_emerging', 'bullish', 3, 'Bitcoin ETF Flow Search Velocity +210%', 'Google Trends data shows a 210% spike in "bitcoin ETF flows" searches over the past 24 hours, historically a leading indicator of institutional interest.', 'Search Velocity', '+210%', ARRAY['BTC'], false, 0.65),
  ('crypto', 'volume_spike', 'bullish', 4, 'ETH Volume Spike 340% Above 7D Average', 'Ethereum spot volume across major exchanges exceeded $28B in the last 24h — 340% above the 7-day rolling average. Funding rates remain flat, suggesting organic demand rather than leveraged speculation.', 'ETH Volume 24h', '$28.4B', ARRAY['ETH'], true, 0.81),
  ('macro', 'macro_event', 'bearish', 3, 'Yield Curve Inversion Deepens to -0.42%', 'The 10Y-2Y Treasury spread has widened to -42 basis points, the deepest inversion since October. Historically, inversions of this magnitude precede economic slowdowns by 12-18 months.', '10Y-2Y Spread', '-0.42%', ARRAY[]::text[], false, 0.88),
  ('cross_domain', 'correlation', 'bullish', 5, 'Cross-Domain Convergence: SOL', 'Solana is simultaneously showing Reddit mention velocity +420%, Google Trends +180%, and a 72h price consolidation above key support. Triple-domain convergence signals typically precede significant moves.', 'Cross-Domain Score', '9.2/10', ARRAY['SOL'], true, 0.73);
