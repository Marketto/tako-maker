import { useSyncExternalStore } from 'react';

/* Transizioni marine tra le schermate: inchiostro, onda o bolle, scelte a caso.
   seaGo(cambio) copre lo schermo, esegue il cambio quando è coperto e poi lo scopre.
   Con «riduci movimento» il cambio è immediato. */

export type SeaKind = 'ink' | 'wave' | 'bubbles';
export const SEA_KINDS: readonly SeaKind[] = ['ink', 'wave', 'bubbles'];

/** Durata della copertura e della scoperta (devono coincidere con le animazioni in styles.css). */
export const COVER_MS = 480;
export const REVEAL_MS = 560;

export interface SeaState {
  id: number;
  kind: SeaKind;
  phase: 'cover' | 'reveal';
  /** Punto da cui parte l'inchiostro: l'ultimo tocco. */
  x: number;
  y: number;
}

/** Una transizione a caso, mai uguale alla precedente. */
export function pickKind(prev: SeaKind | null, rand: () => number = Math.random): SeaKind {
  const pool = SEA_KINDS.filter((k) => k !== prev);
  return pool[Math.min(pool.length - 1, Math.floor(rand() * pool.length))];
}

let state: SeaState | null = null;
let last: SeaKind | null = null;
let seq = 0;
const listeners = new Set<() => void>();
const set = (s: SeaState | null) => {
  state = s;
  listeners.forEach((l) => l());
};

const hasWindow = typeof window !== 'undefined';
let pointer = { x: hasWindow ? window.innerWidth / 2 : 0, y: hasWindow ? window.innerHeight * 0.8 : 0 };
if (hasWindow) {
  window.addEventListener('pointerdown', (e) => (pointer = { x: e.clientX, y: e.clientY }), true);
}

function reducedMotion(): boolean {
  return !hasWindow || typeof window.matchMedia !== 'function' || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** Cambia schermata con una transizione marina. Se ce n'è già una in corso, il cambio avviene subito sotto di essa. */
export function seaGo(change: () => void): void {
  if (reducedMotion() || state) {
    change();
    return;
  }
  const kind = pickKind(last);
  last = kind;
  const id = ++seq;
  set({ id, kind, phase: 'cover', ...pointer });
  window.setTimeout(() => {
    try {
      change();
    } finally {
      if (state?.id === id) set({ ...state, phase: 'reveal' });
      window.setTimeout(() => {
        if (state?.id === id) set(null);
      }, REVEAL_MS);
    }
  }, COVER_MS);
}

export function useSea(): SeaState | null {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
  );
}
