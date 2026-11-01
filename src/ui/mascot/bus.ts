import type { PhraseKind } from './phrases';

/* Piccolo bus di eventi per far reagire Takotta (esportazione, montaggio…)
   senza legare la mascotte ai singoli componenti. */

type Listener = (kind: PhraseKind) => void;
const listeners = new Set<Listener>();

export function cheer(kind: PhraseKind) {
  listeners.forEach((l) => l(kind));
}

export function onCheer(l: Listener): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}
