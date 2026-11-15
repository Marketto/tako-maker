import type { Design, PrinterSpec, UserSetup } from '../types';
import { bedOf } from '../analysis/estimate';
import { towerZone, type Rect } from './primeTower';
import { guideline } from '../../data/guidelines';
import type { OrientInput } from '../geometry/evaluate';

export * from './primeTower';

/** Zona del piatto da lasciare alla torre di spurgo per il design così com'è pianificato (null se non serve). */
export function plateKeepFree(design: Design, setup: UserSetup, printer: PrinterSpec): Rect | null {
  const { strategy } = design.printPlan;
  // Cambio colore manuale a quota e stampa a un colore: nessuna torre.
  if (strategy === 'single' || strategy === 'layer-swap') return null;
  if (strategy === 'multicolor' && !setup.hasMulti) return null;
  const colors = new Set(design.parts.map((p) => p.filamentId ?? '_')).size;
  return towerZone(printer, colors, bedOf(setup, printer));
}

/** Piatto e limiti del materiale di ogni parte, per scegliere come appoggiare i pezzi (core/geometry/orient.ts). */
export function orientInputFor(design: Design, setup: UserSetup, printer: PrinterSpec): OrientInput {
  const mat = (filamentId?: string) => setup.filaments.find((f) => f.id === filamentId)?.material ?? 'PLA';
  return {
    bed: bedOf(setup, printer),
    overhangDeg: Object.fromEntries(design.parts.map((p) => [p.id, guideline(mat(p.filamentId)).overhangDeg])),
    bridgeMm: Object.fromEntries(design.parts.map((p) => [p.id, guideline(mat(p.filamentId)).bridgeMm])),
  };
}
