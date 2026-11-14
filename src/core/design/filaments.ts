import type { Design, Filament } from '../types';

/**
 * Riassegna i pezzi il cui filamento non c'è più (tolto dall'utente).
 * Sceglie un filamento dello stesso materiale se esiste, altrimenti il primo disponibile.
 * Restituisce il progetto aggiornato, oppure null se non serve cambiare nulla.
 */
export function reassignMissingFilaments(design: Design, filaments: Filament[], removed: Filament[] = []): Design | null {
  if (!filaments.length) return null;
  const ids = new Set(filaments.map((f) => f.id));
  const materialOf = new Map(removed.map((f) => [f.id, f.material]));
  let changed = false;
  const parts = design.parts.map((p) => {
    if (!p.filamentId || ids.has(p.filamentId)) return p;
    const material = materialOf.get(p.filamentId);
    const next = filaments.find((f) => f.material === material) ?? filaments[0];
    changed = true;
    return { ...p, filamentId: next.id };
  });
  return changed ? { ...design, parts } : null;
}
