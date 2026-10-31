/* Configurazione dei modelli e dei prezzi (USD per milione di token).
   Prezzi da https://platform.claude.com/docs/en/about-claude/pricing (ottobre 2026).
   Aggiornali qui se cambiano: il contatore dei costi dipende da questi valori. */

export type ModelTier = 'fast' | 'smart';

export interface ModelPrice {
  input: number;
  output: number;
  cacheWrite: number;
  cacheRead: number;
}

export const MODELS: Record<ModelTier, { id: string; label: string; price: ModelPrice }> = {
  fast: {
    id: 'claude-haiku-5-5',
    label: 'Claude Haiku 5.5',
    // Fascia ≤100K token di prompt: le richieste dell'app restano sempre sotto.
    price: { input: 0.1, output: 0.5, cacheWrite: 0.125, cacheRead: 0.01 },
  },
  smart: {
    id: 'claude-sonnet-5-5',
    label: 'Claude Sonnet 5.5',
    price: { input: 2, output: 10, cacheWrite: 2.5, cacheRead: 0.1 },
  },
};

/** Costo di una singola ricerca web lato server ($10 ogni 1000). */
export const WEB_SEARCH_COST = 0.01;

export const LIMITS = {
  /** Iterazioni massime del ciclo agente per singolo messaggio. */
  maxAgentTurns: 6,
  /** Messaggi di chat precedenti inviati all'AI (il design attuale viaggia sempre a parte). */
  historyMessages: 6,
  maxSearchUses: 3,
  searchCacheDays: 7,
};

export const SEARCH_DOMAINS = ['printables.com', 'thingiverse.com', 'makerworld.com', 'myminifactory.com'];

export const DEFAULT_SETTINGS = {
  /** Tetto di spesa mensile (USD) oltre il quale l'app blocca le chiamate. */
  monthlyCapUsd: 10,
  /** Usa solo il modello veloce/economico per tutte le skill. */
  economy: false,
  /** Se le regole locali non bastano, chiede a Haiku di scegliere la skill. */
  smartRouting: true,
  /** URL del proxy opzionale (es. Cloudflare Worker). Vuoto = chiamata diretta con chiave personale. */
  proxyUrl: '',
};
