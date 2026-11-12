import type { Design, PrinterSpec, Question, UserSetup } from '../core/types';
import type { SearchResult } from '../agent/tools';
import type { TokenTally } from '../agent/budget';

/* Stato condiviso tra la PWA e il connettore (server MCP su Cloudflare Worker).
   La PWA lo crea con un codice di abbinamento; l'assistente nella chat lo legge
   e lo modifica con gli strumenti MCP; la PWA lo rilegge e mostra il risultato. */

export interface ConnectorNote {
  role: 'assistant' | 'user';
  text: string;
  results?: SearchResult[];
  at: number;
}

export interface ConnectorState {
  /** Versione: cresce a ogni modifica, da qualunque parte arrivi. */
  v: number;
  updatedAt: number;
  setup: UserSetup;
  printer: PrinterSpec;
  design: Design;
  /** Chiavi delle domande automatiche già risposte. */
  answered: string[];
  /** Codice della lingua dell'interfaccia (es. "it", "de"). */
  language: string;
  /** Lingua in inglese, per le istruzioni all'assistente. */
  languageName: string;
  /** Messaggi e risultati arrivati dalla chat (gli ultimi). */
  notes: ConnectorNote[];
  /** Prima volta che la chat ha aperto il progetto: l'app capisce che il collegamento è avvenuto. */
  openedAt?: number;
  /** Stima cumulativa dei token scambiati con la chat (testo degli strumenti in entrata e in uscita). */
  usage?: TokenTally;
  /** Analisi calcolata dall'app (geometria e stime): il Worker non calcola la geometria. */
  report?: ConnectorReport;
}

/** Analisi di una versione del modello, calcolata nell'app e letta dalla chat. */
export interface ConnectorReport {
  /** designKey() del modello analizzato. */
  key: string;
  /** Parti, stime e avvisi in testo per l'assistente. */
  text: string;
  /** Domande automatiche aperte (con le ops delle opzioni). */
  questions: Question[];
  /** Errori di geometria. */
  errors: string[];
  at: number;
}

/** Impronta di modello e risposte: dice se un'analisi è ancora valida (FNV-1a a 32 bit). */
export function designKey(s: Pick<ConnectorState, 'design' | 'answered'>): string {
  const str = JSON.stringify([s.design, s.answered]);
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 0x01000193);
  return `${(h >>> 0).toString(16)}-${str.length.toString(36)}`;
}

/** Stato salvato con la sua revisione: cresce a ogni scrittura, anche senza cambiare versione. */
export interface Stored {
  state: ConnectorState;
  rev: number;
}

/** Archivio delle sessioni con scrittura condizionata (un Durable Object nel Worker). */
export interface ConnectorStore {
  get(code: string): Promise<Stored | null>;
  /** Scrive solo se la revisione è ancora `rev` (null: solo se la sessione non esiste). Restituisce false se no. */
  put(code: string, state: ConnectorState, rev: number | null): Promise<boolean>;
  /** Analisi per il modello con impronta `key`, se c'è; `current` dice se il modello è ancora quello. Leggero per chi aspetta. */
  report(code: string, key: string): Promise<ReportCheck | null>;
}

export interface ReportCheck {
  report?: ConnectorReport;
  current: boolean;
}

/** Controllo dell'analisi fatto accanto ai dati (nel Durable Object). */
export function checkReport(s: ConnectorState, key: string): ReportCheck {
  return { report: s.report?.key === key ? s.report : undefined, current: designKey(s) === key };
}

/** Legge, trasforma e riscrive; se nel frattempo qualcuno ha scritto, riprova sullo stato nuovo. */
export async function update<T>(store: ConnectorStore, code: string, fn: (s: ConnectorState) => { next?: ConnectorState; out: T }): Promise<{ out: T; state: ConnectorState } | null> {
  for (let i = 0; i < 8; i++) {
    const cur = await store.get(code);
    if (!cur) return null;
    const { next, out } = fn(cur.state);
    if (!next) return { out, state: cur.state };
    if (await store.put(code, next, cur.rev)) return { out, state: next };
  }
  throw new Error('Troppe modifiche contemporanee: riprova tra poco.');
}

/** Archivio in memoria, per i test e la prova in locale. */
export function memoryStore(): ConnectorStore & { data: Map<string, Stored> } {
  const data = new Map<string, Stored>();
  return {
    data,
    get: async (c) => structuredClone(data.get(c) ?? null),
    report: async (c, key) => {
      const cur = data.get(c);
      return cur ? structuredClone(checkReport(cur.state, key)) : null;
    },
    put: async (c, state, rev) => {
      const cur = data.get(c);
      if ((cur?.rev ?? null) !== rev) return false;
      data.set(c, { state: structuredClone(state), rev: (cur?.rev ?? 0) + 1 });
      return true;
    },
  };
}

/** Codice di abbinamento: 10 caratteri senza lettere ambigue, es. "K7QM-2XPA-9D". */
export const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const CODE_RE = /^[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{2}$/;

export function newCode(random: (n: number) => Uint8Array = (n) => crypto.getRandomValues(new Uint8Array(n))): string {
  const b = random(10);
  const s = [...b].map((x) => CODE_ALPHABET[x % CODE_ALPHABET.length]).join('');
  return `${s.slice(0, 4)}-${s.slice(4, 8)}-${s.slice(8)}`;
}

export const normalizeCode = (c: string) => c.toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/^(.{4})(.{4})(.{2})$/, '$1-$2-$3');

/** Giorni di vita di una sessione senza modifiche. */
export const SESSION_TTL_DAYS = 7;
export const MAX_NOTES = 20;
