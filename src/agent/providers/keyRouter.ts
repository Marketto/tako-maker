import { KEY_COOLDOWN, PROVIDERS } from '../config';
import { ApiError, type AiClient, type ApiRequest, type ApiResponse } from '../client';
import type { Budget, KV } from '../budget';
import type { Adapter, FailKind, KeyEntry } from './types';
import { anthropicAdapter } from './anthropic';
import { openaiAdapter } from './openai';
import { geminiAdapter } from './gemini';

/* Router delle chiamate AI: prova le chiavi in ordine di priorità e passa alla
   successiva se una ha finito il credito, è in pausa per troppe richieste,
   non è valida o il servizio non risponde. Lo stato delle chiavi (pause,
   errori) resta salvato sul dispositivo. */

export const ADAPTERS: Record<KeyEntry['provider'], Adapter> = {
  anthropic: anthropicAdapter,
  openai: openaiAdapter,
  gemini: geminiAdapter,
};

export interface KeyState {
  /** Fino a quando la chiave è in pausa (ms epoch). */
  until?: number;
  reason?: FailKind;
  message?: string;
  /** Impronta della chiave quando è stata giudicata non valida: se cambia, si riprova. */
  fingerprint?: string;
  lastOk?: number;
}

const STATE_KEY = 'm3d.keystate';
const fingerprint = (k: KeyEntry) => `${k.provider}:${k.key.slice(-6)}:${k.baseUrl ?? ''}:${k.key.length}`;

export const FAIL_LABEL: Record<FailKind, string> = {
  exhausted: 'credito esaurito',
  invalid: 'chiave non valida',
  rate: 'in pausa (troppe richieste)',
  temporary: 'servizio non raggiungibile',
  fatal: 'richiesta rifiutata',
};

export class KeyRouter implements AiClient {
  constructor(
    private keys: () => KeyEntry[],
    private kv: KV,
    private budget: Budget,
    private fetchImpl: typeof fetch = (...a) => fetch(...a),
    private now: () => number = () => Date.now(),
  ) {}

  states(): Record<string, KeyState> {
    try {
      return JSON.parse(this.kv.getItem(STATE_KEY) ?? '{}');
    } catch {
      return {};
    }
  }

  private save(states: Record<string, KeyState>) {
    this.kv.setItem(STATE_KEY, JSON.stringify(states));
  }

  reset(id: string) {
    const s = this.states();
    delete s[id];
    this.save(s);
  }

  /** La chiave è utilizzabile adesso? */
  isAvailable(k: KeyEntry, states = this.states()): boolean {
    if (!k.enabled || !(k.key || k.baseUrl)) return false;
    const st = states[k.id];
    if (!st) return true;
    if (st.reason === 'invalid') return st.fingerprint !== fingerprint(k);
    return !st.until || st.until <= this.now();
  }

  isConfigured(): boolean {
    return this.keys().some((k) => k.enabled && (k.key || k.baseUrl));
  }

  private mark(k: KeyEntry, kind: FailKind, message: string) {
    const s = this.states();
    const cooldown = kind === 'exhausted' ? KEY_COOLDOWN.exhausted : kind === 'rate' ? KEY_COOLDOWN.rate : kind === 'temporary' ? KEY_COOLDOWN.temporary : 0;
    s[k.id] = { reason: kind, message, until: cooldown ? this.now() + cooldown : undefined, fingerprint: kind === 'invalid' ? fingerprint(k) : undefined };
    this.save(s);
  }

  private ok(k: KeyEntry) {
    const s = this.states();
    s[k.id] = { lastOk: this.now() };
    this.save(s);
  }

  async send(req: ApiRequest, signal?: AbortSignal): Promise<ApiResponse & { costUsd: number; provider: string; keyLabel: string }> {
    if (!this.budget.canSpend()) {
      throw new ApiError(`Hai raggiunto il tetto di spesa mensile ($${this.budget.capUsd}). Puoi alzarlo nelle impostazioni.`);
    }
    const all = this.keys();
    if (!all.some((k) => k.enabled && (k.key || k.baseUrl))) throw new ApiError('Aggiungi almeno una chiave AI nelle impostazioni.');
    const states = this.states();
    const failures: string[] = [];
    const candidates = all.filter((k) => this.isAvailable(k, states));
    for (const k of all) if (!candidates.includes(k) && k.enabled && states[k.id]?.reason) failures.push(`${k.label || PROVIDERS[k.provider].label}: ${FAIL_LABEL[states[k.id].reason!]}`);

    for (const k of candidates) {
      const adapter = ADAPTERS[k.provider];
      const model = PROVIDERS[k.provider].models[req.tier];
      const call = adapter.build(req, model.id, k);
      let res: Response;
      try {
        res = await this.fetchImpl(call.url, { ...call.init, signal });
      } catch (e) {
        if ((e as Error).name === 'AbortError') throw e;
        this.mark(k, 'temporary', 'rete');
        failures.push(`${k.label || PROVIDERS[k.provider].label}: connessione non riuscita`);
        continue;
      }
      let body: unknown = null;
      try {
        body = await res.json();
      } catch {
        body = null;
      }
      if (!res.ok) {
        const { kind, message } = adapter.classify(res.status, body);
        this.mark(k, kind, message);
        failures.push(`${k.label || PROVIDERS[k.provider].label}: ${kind === 'fatal' ? message : FAIL_LABEL[kind]}`);
        continue;
      }
      const parsed = adapter.parse(body);
      this.ok(k);
      const costUsd = this.budget.record(model.price, parsed.usage);
      return { ...parsed, costUsd, provider: k.provider, keyLabel: k.label || PROVIDERS[k.provider].label };
    }
    throw new ApiError(failures.length ? `Nessuna chiave AI disponibile. ${failures.join(' · ')}` : 'Nessuna chiave AI disponibile in questo momento: riprova tra poco.');
  }
}
