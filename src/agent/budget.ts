import type { ModelPrice } from './config';

/* Contatore della spesa: ogni risposta dell'API riporta i token usati,
   qui vengono convertiti in dollari e sommati per mese. */

export interface Usage {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens?: number | null;
  cache_read_input_tokens?: number | null;
  server_tool_use?: { web_search_requests?: number } | null;
}

export function costOf(p: ModelPrice, u: Usage): number {
  const m = 1_000_000;
  return (
    (u.input_tokens * p.input) / m +
    (u.output_tokens * p.output) / m +
    ((u.cache_creation_input_tokens ?? 0) * p.cacheWrite) / m +
    ((u.cache_read_input_tokens ?? 0) * p.cacheRead) / m +
    (u.server_tool_use?.web_search_requests ?? 0) * p.search
  );
}

/* Stima dei token per i testi scambiati senza API (copia e incolla, connettore):
   circa 3,5 caratteri per token tra testo italiano, numeri e JSON. */
export const CHARS_PER_TOKEN = 3.5;
export const estimateTokens = (s: string) => Math.ceil(s.length / CHARS_PER_TOKEN);

export interface TokenTally {
  calls: number;
  inputTokens: number;
  outputTokens: number;
}

export const emptyTally = (): TokenTally => ({ calls: 0, inputTokens: 0, outputTokens: 0 });

export function addTally(a: TokenTally | undefined, b: TokenTally): TokenTally {
  const x = a ?? emptyTally();
  return { calls: x.calls + b.calls, inputTokens: x.inputTokens + b.inputTokens, outputTokens: x.outputTokens + b.outputTokens };
}

/** Differenza tra due conteggi cumulativi (zero se il nuovo è ripartito da capo). */
export function diffTally(now: TokenTally, seen: TokenTally | undefined): TokenTally {
  const s = seen ?? emptyTally();
  if (now.calls < s.calls || now.inputTokens < s.inputTokens || now.outputTokens < s.outputTokens) return { ...now };
  return { calls: now.calls - s.calls, inputTokens: now.inputTokens - s.inputTokens, outputTokens: now.outputTokens - s.outputTokens };
}

/** Token letti (input, cache compresa) e scritti da una risposta dell'API. */
export function tokensOf(u: Usage): { input: number; output: number } {
  return { input: u.input_tokens + (u.cache_creation_input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0), output: u.output_tokens };
}

/** Modalità senza API: i token li consuma la chat dell'utente, qui solo stimati. */
export type EstimatedMode = 'manual' | 'connector';

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
  /** Stime per copia e incolla e connettore (token della chat dell'utente, non a consumo qui). */
  manual?: TokenTally;
  connector?: TokenTally;
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

  record(price: ModelPrice, u: Usage): number {
    const usd = costOf(price, u);
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

  /** Somma una stima di token per le modalità senza API (nessun costo in dollari qui). */
  recordEstimate(mode: EstimatedMode, t: TokenTally) {
    if (!t.calls && !t.inputTokens && !t.outputTokens) return;
    const r = this.current();
    r[mode] = addTally(r[mode], t);
    this.kv.setItem(KEY, JSON.stringify(r));
  }
}
