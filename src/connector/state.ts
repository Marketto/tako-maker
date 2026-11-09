import type { Design, PrinterSpec, UserSetup } from '../core/types';
import type { SearchResult } from '../agent/tools';

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
