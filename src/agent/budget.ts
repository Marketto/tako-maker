import { MODELS, WEB_SEARCH_COST, type ModelTier } from './config';

/* Contatore della spesa: ogni risposta dell'API riporta i token usati,
   qui vengono convertiti in dollari e sommati per mese. */

export interface Usage {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens?: number | null;
  cache_read_input_tokens?: number | null;
  server_tool_use?: { web_search_requests?: number } | null;
}

export function costOf(tier: ModelTier, u: Usage): number {
  const p = MODELS[tier].price;
  const m = 1_000_000;
  return (
    (u.input_tokens * p.input) / m +
    (u.output_tokens * p.output) / m +
    ((u.cache_creation_input_tokens ?? 0) * p.cacheWrite) / m +
    ((u.cache_read_input_tokens ?? 0) * p.cacheRead) / m +
    (u.server_tool_use?.web_search_requests ?? 0) * WEB_SEARCH_COST
  );
}

export interface KV {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
}

export interface SpendRecord {
  month: string; // YYYY-MM
  usd: number;
  calls: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  searches: number;
}

const KEY = 'm3d.spend';
const monthNow = () => new Date().toISOString().slice(0, 7);

export class Budget {
  constructor(private kv: KV, public capUsd: number) {}

  current(): SpendRecord {
    try {
      const r = JSON.parse(this.kv.getItem(KEY) ?? '') as SpendRecord;
      if (r.month === monthNow()) return r;
    } catch {
      /* primo avvio */
    }
    return { month: monthNow(), usd: 0, calls: 0, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, searches: 0 };
  }

  canSpend(estimateUsd = 0): boolean {
    return this.current().usd + estimateUsd < this.capUsd;
  }

  record(tier: ModelTier, u: Usage): number {
    const usd = costOf(tier, u);
    const r = this.current();
    r.usd += usd;
    r.calls += 1;
    r.inputTokens += u.input_tokens + (u.cache_creation_input_tokens ?? 0);
    r.outputTokens += u.output_tokens;
    r.cacheReadTokens += u.cache_read_input_tokens ?? 0;
    r.searches += u.server_tool_use?.web_search_requests ?? 0;
    this.kv.setItem(KEY, JSON.stringify(r));
    return usd;
  }
}
