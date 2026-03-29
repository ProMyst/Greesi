import { z } from 'zod';

// ── Crypto ──────────────────────────────────────────────────
export const PriceTickSchema = z.object({
  symbol:           z.string().min(1),
  price_usd:        z.number().positive(),
  volume_24h:       z.number().nonnegative().optional(),
  market_cap:       z.number().nonnegative().optional(),
  price_change_24h: z.number().optional(),
});

export const BinanceTickerSchema = z.object({
  symbol:               z.string(),
  lastPrice:            z.string(),
  priceChangePercent:   z.string(),
  volume:               z.string(),
  quoteVolume:          z.string(),
  highPrice:            z.string(),
  lowPrice:             z.string(),
});

export type PriceTick = z.infer<typeof PriceTickSchema>;

// ── Macro ────────────────────────────────────────────────────
export const MacroDataPointSchema = z.object({
  series_id:        z.string(),
  series_name:      z.string(),
  value:            z.number(),
  unit:             z.string().optional(),
  observation_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  vintage_date:     z.string().optional(),
});

export type MacroDataPoint = z.infer<typeof MacroDataPointSchema>;

// ── RSS ──────────────────────────────────────────────────────
export const RssArticleSchema = z.object({
  feed_name:    z.string(),
  feed_url:     z.string().url(),
  article_url:  z.string().url(),
  title:        z.string().min(1),
  summary:      z.string().optional(),
  author:       z.string().optional(),
  published_at: z.string().optional(),
});

export type RssArticle = z.infer<typeof RssArticleSchema>;

// ── Signal ───────────────────────────────────────────────────
export const SignalSchema = z.object({
  domain:           z.enum(['crypto','trends','macro','alt_data','finance','cross_domain']),
  signal_type:      z.string(),
  direction:        z.enum(['bullish','bearish','neutral','watch']),
  strength:         z.number().int().min(1).max(5),
  title:            z.string().min(1),
  summary:          z.string().min(1),
  metric_label:     z.string().optional(),
  metric_value:     z.string().optional(),
  metric_raw:       z.number().optional(),
  related_assets:   z.array(z.string()).default([]),
  confidence_score: z.number().min(0).max(1).optional(),
  cross_domain:     z.boolean().default(false),
});

export type SignalInput = z.infer<typeof SignalSchema>;
