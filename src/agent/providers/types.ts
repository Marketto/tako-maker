import type { ProviderId } from '../config';
import type { ApiRequest, ApiResponse } from '../client';

/** Una chiave API configurata dall'utente. L'ordine nell'elenco è la priorità. */
export interface KeyEntry {
  id: string;
  provider: ProviderId;
  label: string;
  key: string;
  enabled: boolean;
  /** Solo Claude: proxy compatibile (es. Cloudflare Worker) al posto della chiave. */
  baseUrl?: string;
  accessCode?: string;
}

/** Come reagire a un errore di una chiave. */
export type FailKind =
  | 'exhausted' // credito o quota finiti → pausa lunga
  | 'invalid' // chiave sbagliata o revocata → esclusa finché non la modifichi
  | 'rate' // troppe richieste → pausa breve
  | 'temporary' // servizio sovraccarico o rete → pausa brevissima
  | 'fatal'; // richiesta rifiutata da questo provider → si prova il successivo

export interface HttpCall {
  url: string;
  init: RequestInit;
}

export interface Adapter {
  id: ProviderId;
  build(req: ApiRequest, model: string, key: KeyEntry): HttpCall;
  parse(json: unknown): ApiResponse;
  classify(status: number, body: unknown): { kind: FailKind; message: string };
}

export const errorMessage = (body: unknown): string => {
  const b = body as { error?: { message?: string } | string; message?: string } | null;
  if (!b) return '';
  if (typeof b.error === 'string') return b.error;
  return b.error?.message ?? b.message ?? '';
};
