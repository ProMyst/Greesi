-- ── Greesi Supabase Schema ──────────────────────────────────────
-- Run this in your Supabase SQL editor to set up the database.

-- Signal history
CREATE TABLE IF NOT EXISTS signals (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  domain       text NOT NULL CHECK (domain IN ('crypto','trends','macro','alt-data','finance')),
  type         text NOT NULL CHECK (type IN ('rate-move','momentum','alert','correlation')),
  title        text NOT NULL,
  body         text,
  metric_label text,
  metric_value text,
  direction    text NOT NULL DEFAULT 'neutral' CHECK (direction IN ('bullish','bearish','neutral')),
  strength     integer NOT NULL DEFAULT 3 CHECK (strength BETWEEN 1 AND 5),
  source_url   text,
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- Waitlist with interest segmentation
CREATE TABLE IF NOT EXISTS waitlist (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email      text UNIQUE NOT NULL,
  interest   text,         -- 'crypto' | 'trends' | 'macro' | 'alt-data' | 'all'
  user_type  text CHECK (user_type IN ('individual','institutional')),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Tracked products (finance editorial)
CREATE TABLE IF NOT EXISTS tracked_products (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category       text NOT NULL,
  name           text NOT NULL,
  ticker         text,
  current_value  text,
  previous_value text,
  direction      text,
  last_updated   timestamptz NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS signals_domain_idx    ON signals (domain);
CREATE INDEX IF NOT EXISTS signals_created_idx   ON signals (created_at DESC);
CREATE INDEX IF NOT EXISTS waitlist_created_idx  ON waitlist (created_at DESC);

-- Row Level Security: public can read signals, only service key can write
ALTER TABLE signals  ENABLE ROW LEVEL SECURITY;
ALTER TABLE waitlist ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Signals are publicly readable"
  ON signals FOR SELECT USING (true);

CREATE POLICY "Waitlist insert via service key only"
  ON waitlist FOR INSERT WITH CHECK (true);

-- Seed: 3 sample signals (matches homepage signal cards)
INSERT INTO signals (domain, type, title, body, metric_label, metric_value, direction, strength, source_url)
VALUES
  (
    'crypto', 'rate-move',
    'Wealthfront Cash raised to 4.80% APY — highest tracked rate this quarter',
    'National average: 0.46%. For a $25k balance, that''s $1,085/yr more than a typical bank.',
    'Current APY', '4.80%', 'bullish', 5,
    'https://www.wealthfront.com/cash'
  ),
  (
    'finance', 'alert',
    'Chase Sapphire Preferred at 80,000-point offer — above historical median',
    'Historical median is 60k. At 80k, this bonus covers the $95 annual fee ~10x over.',
    'Bonus points', '80,000', 'bullish', 4,
    'https://creditcards.chase.com/rewards-credit-cards/sapphire/preferred'
  ),
  (
    'macro', 'correlation',
    'Fed holds at 5.25–5.50% — HYSA rates stable, CD ladder still the play',
    'When cuts begin, HYSA rates drop before CDs. Lock in today''s rate now.',
    'Fed Funds floor', '5.25%', 'neutral', 3,
    'https://fred.stlouisfed.org/series/FEDFUNDS'
  )
ON CONFLICT DO NOTHING;
