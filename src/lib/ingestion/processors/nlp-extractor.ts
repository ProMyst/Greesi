// Lightweight NLP — no external API calls, runs in-process

const ASSET_PATTERNS: Record<string, string[]> = {
  BTC:  ['bitcoin', 'btc', '₿'],
  ETH:  ['ethereum', 'eth', 'ether'],
  SOL:  ['solana', 'sol'],
  BNB:  ['binance coin', 'bnb'],
  AVAX: ['avalanche', 'avax'],
  LINK: ['chainlink', 'link'],
  UNI:  ['uniswap', 'uni'],
  DOGE: ['dogecoin', 'doge'],
  XRP:  ['ripple', 'xrp'],
  ADA:  ['cardano', 'ada'],
};

const SECTOR_PATTERNS: Record<string, string[]> = {
  crypto:  ['crypto', 'blockchain', 'defi', 'nft', 'web3', 'bitcoin', 'ethereum', 'token'],
  macro:   ['fed', 'inflation', 'gdp', 'unemployment', 'recession', 'rate', 'treasury', 'yield'],
  finance: ['bank', 'stock', 'equity', 'market', 'nasdaq', 's&p', 'earnings', 'ipo'],
  trends:  ['trending', 'viral', 'social', 'reddit', 'twitter', 'sentiment', 'search'],
};

const POSITIVE_WORDS = ['surge','rally','bull','gain','rise','soar','record','high','growth','positive','buy','long','strong','breakout','momentum','profit'];
const NEGATIVE_WORDS = ['crash','drop','bear','loss','fall','plunge','low','decline','sell','short','weak','breakdown','fear','risk','dump','collapse'];

export function extractAssets(text: string): string[] {
  const lower = text.toLowerCase();
  const found = new Set<string>();

  // Uppercase ticker match (e.g. "BTC", "ETH")
  const tickerMatches = text.match(/\b[A-Z]{2,5}\b/g) ?? [];
  for (const t of tickerMatches) {
    if (ASSET_PATTERNS[t]) found.add(t);
  }

  // Pattern match on lowercase
  for (const [symbol, patterns] of Object.entries(ASSET_PATTERNS)) {
    if (patterns.some(p => lower.includes(p))) found.add(symbol);
  }

  return Array.from(found);
}

export function extractSectors(text: string): string[] {
  const lower = text.toLowerCase();
  const found = new Set<string>();
  for (const [sector, patterns] of Object.entries(SECTOR_PATTERNS)) {
    if (patterns.some(p => lower.includes(p))) found.add(sector);
  }
  return Array.from(found);
}

/** Returns -1.0 to 1.0 */
export function scoreSentiment(text: string): { score: number; label: 'positive' | 'negative' | 'neutral' } {
  const words = text.toLowerCase().split(/\W+/);
  let pos = 0, neg = 0;
  for (const w of words) {
    if (POSITIVE_WORDS.includes(w)) pos++;
    if (NEGATIVE_WORDS.includes(w)) neg++;
  }
  const total = pos + neg;
  if (total === 0) return { score: 0, label: 'neutral' };
  const score = parseFloat(((pos - neg) / total).toFixed(3));
  return {
    score,
    label: score > 0.1 ? 'positive' : score < -0.1 ? 'negative' : 'neutral',
  };
}

/** 1-10 importance based on source weight and content signals */
export function scoreImportance(title: string, sourceWeight: number): number {
  const urgent = ['breaking','alert','urgent','just in','update','flash'].some(w => title.toLowerCase().includes(w));
  const highImpact = ['fed','sec','regulation','ban','hack','crash','record'].some(w => title.toLowerCase().includes(w));
  let score = Math.round(sourceWeight * 0.7);
  if (urgent) score += 2;
  if (highImpact) score += 1;
  return Math.min(10, Math.max(1, score));
}
