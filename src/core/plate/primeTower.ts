import type { PrinterSpec, Vec3 } from '../types';

/* Torre di spurgo: con più colori nello stesso piatto lo slicer stampa una torre
   in una posizione predefinita (diversa per stampante e slicer). L'app lascia
   libera quella zona quando dispone i pezzi e la segnala nell'anteprima. */

/** Rettangolo sul piatto: angolo anteriore sinistro (x, y), larghezza w (X) e profondità d (Y), in mm. */
export interface Rect {
  x: number;
  y: number;
  w: number;
  d: number;
}

export interface PrimeTowerSpec extends Rect {
  /** Brim attorno alla torre (mm). */
  brim: number;
}

/** Spazio di rispetto oltre il brim della torre. */
export const TOWER_MARGIN = 5;

/* Valori predefiniti per famiglia di slicer, se la stampante non ha dati propri.
   Bambu Studio e i suoi derivati (OrcaSlicer, Creality Print, QIDI Studio…) partono da (165, 250)
   — (15, 250) per le stampanti a piatto mobile — riportata dentro il piatto con 15 mm di margine;
   la torre è quadrata, ~32 mm per lato con 4 colori. PrusaSlicer: angolo fisso (170, 140), larghezza 60. */
export const TOWER_DEFAULTS: Record<'bambu' | 'orca' | 'prusa', (bed: Vec3, bedslinger: boolean) => PrimeTowerSpec> = {
  bambu: (bed, i3) => ({ x: Math.min(i3 ? 15 : 165, bed[0] - 47), y: Math.min(250, bed[1] - 47), w: 32, d: 32, brim: 3 }),
  orca: (bed, i3) => ({ x: Math.min(i3 ? 18 : 165, bed[0] - 50), y: Math.min(250, bed[1] - 50), w: 32, d: 32, brim: 3 }),
  prusa: (bed) => ({ x: Math.min(170, bed[0] - 62), y: Math.min(140, bed[1] - 47), w: 60, d: 45, brim: 2 }),
};

export function slicerFamily(slicer: string): keyof typeof TOWER_DEFAULTS {
  return /bambu/i.test(slicer) ? 'bambu' : /prusa/i.test(slicer) ? 'prusa' : 'orca';
}

/** Torre prevista per la stampante (null se non usa una torre). */
export function towerSpec(printer: PrinterSpec, bed: Vec3 = printer.bed): PrimeTowerSpec | null {
  const m = printer.multi;
  if (!m) return null;
  if (m.tower === null) return null;
  return m.tower ?? TOWER_DEFAULTS[slicerFamily(printer.slicer)](bed, printer.kinematics === 'bedslinger');
}

/** Zona da lasciare libera per `colors` colori nello stesso piatto, già allargata di brim e margine e limitata al piatto. */
export function towerZone(printer: PrinterSpec, colors: number, bed: Vec3 = printer.bed): Rect | null {
  if (colors < 2) return null;
  const t = towerSpec(printer, bed);
  if (!t) return null;
  // La torre cresce con il volume di spurgo, cioè con il numero di colori (dati riferiti a 4 colori):
  // quella quadrata cresce in lato, quella a larghezza fissa (PrusaSlicer) in profondità.
  const k = Math.min(2, Math.max(0.6, (colors - 1) / 3));
  const square = Math.abs(t.w - t.d) < 0.5;
  const w = square ? t.w * Math.sqrt(k) : t.w;
  const d = square ? t.d * Math.sqrt(k) : t.d * k;
  const pad = t.brim + TOWER_MARGIN;
  const x0 = Math.max(0, t.x - pad);
  const y0 = Math.max(0, t.y - pad);
  const x1 = Math.min(bed[0], t.x + w + pad);
  const y1 = Math.min(bed[1], t.y + d + pad);
  return { x: x0, y: y0, w: x1 - x0, d: y1 - y0 };
}

export const overlaps = (a: Rect, b: Rect) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.d && b.y < a.y + a.d;

/**
 * Posizione (angolo anteriore sinistro) per un ingombro w×d sul piatto, il più vicino
 * possibile al centro, senza toccare la zona libera. null se non c'è posto.
 */
export function placeAvoiding(w: number, d: number, bed: Vec3, zone: Rect | null, gap = 2): { x: number; y: number } | null {
  if (w > bed[0] || d > bed[1]) return null;
  const centered = { x: (bed[0] - w) / 2, y: (bed[1] - d) / 2 };
  if (!zone || !overlaps({ ...centered, w, d }, zone)) return centered;
  const clampX = (x: number) => Math.min(Math.max(x, 0), bed[0] - w);
  const clampY = (y: number) => Math.min(Math.max(y, 0), bed[1] - d);
  // Candidati: spostato a sinistra, a destra, davanti o dietro la zona.
  const cands = [
    { x: clampX(zone.x - gap - w), y: centered.y },
    { x: clampX(zone.x + zone.w + gap), y: centered.y },
    { x: centered.x, y: clampY(zone.y - gap - d) },
    { x: centered.x, y: clampY(zone.y + zone.d + gap) },
    { x: clampX(zone.x - gap - w), y: clampY(zone.y - gap - d) },
    { x: clampX(zone.x + zone.w + gap), y: clampY(zone.y - gap - d) },
    { x: clampX(zone.x - gap - w), y: clampY(zone.y + zone.d + gap) },
    { x: clampX(zone.x + zone.w + gap), y: clampY(zone.y + zone.d + gap) },
  ].filter((c) => !overlaps({ ...c, w, d }, zone));
  if (!cands.length) return null;
  const dist = (c: { x: number; y: number }) => Math.hypot(c.x - centered.x, c.y - centered.y);
  return cands.sort((a, b) => dist(a) - dist(b))[0];
}

/** Il modello (eventualmente ruotato di 90°) entra nel piatto senza toccare la torre? */
export function fitsWithTower(size: Vec3, bed: Vec3, zone: Rect | null): boolean {
  if (size[2] > bed[2]) return false;
  return !!placeAvoiding(size[0], size[1], bed, zone) || !!placeAvoiding(size[1], size[0], bed, zone);
}
