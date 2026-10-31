import { MODELS, type ModelTier } from './config';
import type { Budget, Usage } from './budget';

/* Client minimale per la Messages API, via fetch.
   Due modalità:
   - chiave personale (BYOK): la chiave resta nel browser dell'utente e la
     richiesta va diretta a api.anthropic.com (header CORS dedicato);
   - proxy: la richiesta va a un tuo endpoint (es. Cloudflare Worker) che
     aggiunge la chiave lato server. Vedi docs/DEPLOY.md. */

export type ContentBlock =
  | { type: 'text'; text: string; cache_control?: CacheControl }
  | { type: 'tool_use'; id: string; name: string; input: unknown }
  | { type: 'tool_result'; tool_use_id: string; content: string; is_error?: boolean }
  | { type: 'server_tool_use'; id: string; name: string; input: unknown }
  | { type: 'web_search_tool_result'; tool_use_id: string; content: unknown };

export interface CacheControl {
  type: 'ephemeral';
}

export interface Message {
  role: 'user' | 'assistant';
  content: string | ContentBlock[];
}

export interface ToolDef {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
  cache_control?: CacheControl;
}

export interface ServerTool {
  type: string;
  name: string;
  [k: string]: unknown;
}

export interface ApiRequest {
  tier: ModelTier;
  system: { type: 'text'; text: string; cache_control?: CacheControl }[];
  messages: Message[];
  tools?: (ToolDef | ServerTool)[];
  tool_choice?: { type: 'auto' | 'any' | 'none' } | { type: 'tool'; name: string };
  max_tokens: number;
  temperature?: number;
}

export interface ApiResponse {
  id: string;
  content: ContentBlock[];
  stop_reason: 'end_turn' | 'tool_use' | 'max_tokens' | 'stop_sequence' | 'pause_turn' | 'refusal' | null;
  usage: Usage;
}

export interface Credentials {
  apiKey?: string;
  proxyUrl?: string;
  /** Codice d'accesso richiesto dal proxy, se configurato. */
  accessCode?: string;
}

export class ApiError extends Error {
  constructor(message: string, public status?: number) {
    super(message);
  }
}

export class ClaudeClient {
  constructor(private creds: () => Credentials, private budget: Budget, private fetchImpl: typeof fetch = (...a) => fetch(...a)) {}

  isConfigured(): boolean {
    const c = this.creds();
    return !!(c.apiKey || c.proxyUrl);
  }

  async send(req: ApiRequest, signal?: AbortSignal): Promise<ApiResponse & { costUsd: number }> {
    if (!this.budget.canSpend()) {
      throw new ApiError(`Hai raggiunto il tetto di spesa mensile ($${this.budget.capUsd}). Puoi alzarlo nelle impostazioni.`);
    }
    const c = this.creds();
    const url = c.proxyUrl ? c.proxyUrl.replace(/\/$/, '') + '/v1/messages' : 'https://api.anthropic.com/v1/messages';
    const headers: Record<string, string> = {
      'content-type': 'application/json',
      'anthropic-version': '2023-06-01',
    };
    if (c.proxyUrl) {
      if (c.accessCode) headers['x-access-code'] = c.accessCode;
    } else if (c.apiKey) {
      headers['x-api-key'] = c.apiKey;
      headers['anthropic-dangerous-direct-browser-access'] = 'true';
    } else {
      throw new ApiError('Inserisci la tua chiave API nelle impostazioni.');
    }
    const body = {
      model: MODELS[req.tier].id,
      max_tokens: req.max_tokens,
      system: req.system,
      messages: req.messages,
      tools: req.tools,
      tool_choice: req.tool_choice,
      temperature: req.temperature,
    };
    let res: Response;
    try {
      res = await this.fetchImpl(url, { method: 'POST', headers, body: JSON.stringify(body), signal });
    } catch (e) {
      if ((e as Error).name === 'AbortError') throw e;
      throw new ApiError('Connessione non riuscita. Controlla la rete.');
    }
    if (!res.ok) {
      let msg = `Errore API (${res.status})`;
      try {
        const j = await res.json();
        msg = j?.error?.message ? `${msg}: ${j.error.message}` : msg;
      } catch {
        /* corpo non JSON */
      }
      if (res.status === 401) msg = 'Chiave API non valida.';
      if (res.status === 429) msg = 'Troppe richieste: riprova tra poco.';
      if (res.status === 529) msg = 'Servizio momentaneamente sovraccarico: riprova tra poco.';
      throw new ApiError(msg, res.status);
    }
    const data = (await res.json()) as ApiResponse;
    const costUsd = this.budget.record(req.tier, data.usage);
    return { ...data, costUsd };
  }
}

/** Marca l'ultimo elemento come punto di cache (prompt caching). */
export function withCache<T extends object>(list: T[]): T[] {
  if (!list.length) return list;
  const copy = list.slice();
  copy[copy.length - 1] = { ...copy[copy.length - 1], cache_control: { type: 'ephemeral' } };
  return copy;
}
