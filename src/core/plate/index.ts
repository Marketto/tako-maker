import type { Design, PrinterSpec, UserSetup } from '../types';
import { bedOf } from '../analysis/estimate';
import { towerZone, type Rect } from './primeTower';

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
