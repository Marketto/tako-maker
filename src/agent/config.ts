/* Provider, modelli e prezzi (USD per milione di token).
   Fonti (novembre 2026):
   - Claude:  https://platform.claude.com/docs/en/about-claude/pricing
   - OpenAI:  https://developers.openai.com/api/docs/pricing
   - Gemini:  https://ai.google.dev/gemini-api/docs/pricing
   Aggiorna qui se cambiano: il contatore dei costi dipende da questi valori. */

export type ModelTier = 'fast' | 'smart';
export type ProviderId = 'anthropic' | 'openai' | 'gemini';

export interface ModelPrice {
  input: number;
  output: number;
  cacheWrite: number;
  cacheRead: number;
  /** Costo di una ricerca web lato server (USD per ricerca). */
  search: number;
}

export interface ProviderModel {
  id: string;
  label: string;
  price: ModelPrice;
}

export interface ProviderInfo {
  label: string;
  /** Dove creare la chiave. */
  keyUrl: string;
  keyPlaceholder: string;
  models: Record<ModelTier, ProviderModel>;
}

export const PROVIDERS: Record<ProviderId, ProviderInfo> = {
  anthropic: {
    label: 'Claude (Anthropic)',
    keyUrl: 'https://platform.claude.com/settings/keys',
    keyPlaceholder: 'sk-ant-…',
    models: {
      // Fascia ≤100K token di prompt: le richieste dell'app restano sempre sotto.
      fast: { id: 'claude-haiku-5-5', label: 'Claude Haiku 5.5', price: { input: 0.1, output: 0.5, cacheWrite: 0.125, cacheRead: 0.01, search: 0.01 } },
      smart: { id: 'claude-sonnet-5-5', label: 'Claude Sonnet 5.5', price: { input: 2, output: 10, cacheWrite: 2.5, cacheRead: 0.1, search: 0.01 } },
    },
  },
  openai: {
    label: 'GPT (OpenAI)',
    keyUrl: 'https://platform.openai.com/api-keys',
    keyPlaceholder: 'sk-…',
    models: {
      fast: { id: 'gpt-6-luna', label: 'GPT-6 Luna', price: { input: 0.1, output: 0.5, cacheWrite: 0.1, cacheRead: 0.01, search: 0.01 } },
      smart: { id: 'gpt-6.1-sol', label: 'GPT-6.1 Sol', price: { input: 2, output: 10, cacheWrite: 2, cacheRead: 0.1, search: 0.01 } },
    },
  },
  gemini: {
    label: 'Gemini (Google)',
    keyUrl: 'https://aistudio.google.com/apikey',
    keyPlaceholder: 'AIza…',
    models: {
      fast: { id: 'gemini-3.5-flash-lite', label: 'Gemini 3.5 Flash-Lite', price: { input: 0.3, output: 2.5, cacheWrite: 0.3, cacheRead: 0.03, search: 0.014 } },
      // Prezzo valido fino al 31/12/2026 (poi raddoppia): aggiornalo a gennaio.
      smart: { id: 'gemini-3.8-flash', label: 'Gemini 3.8 Flash', price: { input: 0.75, output: 3.75, cacheWrite: 0.75, cacheRead: 0.075, search: 0.014 } },
    },
  },
};

/** Modelli Claude (compatibilità con il codice esistente e le etichette dell'interfaccia). */
export const MODELS = PROVIDERS.anthropic.models;

export const LIMITS = {
  /** Iterazioni massime del ciclo agente per singolo messaggio. */
  maxAgentTurns: 6,
  /** Messaggi di chat precedenti inviati all'AI (il design attuale viaggia sempre a parte). */
  historyMessages: 6,
  maxSearchUses: 3,
  searchCacheDays: 7,
};

/** Pause dopo un errore di una chiave, prima di riprovarla (ms). */
export const KEY_COOLDOWN = {
  exhausted: 24 * 3600_000,
  rate: 60_000,
  temporary: 20_000,
};

export const SEARCH_DOMAINS = ['printables.com', 'thingiverse.com', 'makerworld.com', 'myminifactory.com'];

export const DEFAULT_SETTINGS = {
  /** Tetto di spesa mensile (USD) oltre il quale l'app blocca le chiamate. */
  monthlyCapUsd: 10,
  /** Usa solo il modello veloce/economico per tutte le skill. */
  economy: false,
  /** Se le regole locali non bastano, chiede al modello veloce di scegliere la skill. */
  smartRouting: true,
};
