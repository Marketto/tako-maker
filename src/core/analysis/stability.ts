import type { Vec3 } from '../types';
import { STABILITY } from '../../data/guidelines';

/* Stabilità del modello appoggiato su un piano, nella posizione in cui è disegnato (quella d'uso):
   baricentro di tutte le parti montate, pesato con la densità del materiale, e base d'appoggio
   (inviluppo dei punti più bassi). Se il baricentro cade fuori dalla base il modello cade; se è
   vicino al bordo rispetto alla sua altezza basta poco per ribaltarlo. */

export interface StabilityPart {
  volume: number;
  filamentId?: string;
  mesh?: { positions: Float32Array; indices?: Uint32Array };
}

export interface Stability {
  /** Baricentro (mm). */
  com: Vec3;
  /** Distanza del baricentro dal bordo della base, vista dall'alto (mm, negativa se fuori). */
  marginMm: number;
  /** Altezza del baricentro sopra il piano (mm). */
  heightMm: number;
  /** Inclinazione oltre la quale si ribalta (gradi; 0 se cade da solo). */
  tipDeg: number;
}

/** Baricentro e volume di una mesh chiusa (somma dei tetraedri con l'origine). */
function centroid(pos: Float32Array, idx: Uint32Array): { c: Vec3; v: number } {
  let v = 0;
  const c: Vec3 = [0, 0, 0];
  for (let t = 0; t < idx.length; t += 3) {
    const a = idx[t] * 3;
    const b = idx[t + 1] * 3;
    const d = idx[t + 2] * 3;
    const vol =
      (pos[a] * (pos[b + 1] * pos[d + 2] - pos[b + 2] * pos[d + 1]) -
        pos[a + 1] * (pos[b] * pos[d + 2] - pos[b + 2] * pos[d]) +
        pos[a + 2] * (pos[b] * pos[d + 1] - pos[b + 1] * pos[d])) /
      6;
    v += vol;
    for (let k = 0; k < 3; k++) c[k] += (vol * (pos[a + k] + pos[b + k] + pos[d + k])) / 4;
  }
  return { c: v ? (c.map((x) => x / v) as Vec3) : c, v };
}

type P2 = [number, number];
const cross = (o: P2, a: P2, b: P2) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);

/** Inviluppo convesso 2D (catena monotona), in senso antiorario. */
function hull2(pts: P2[]): P2[] {
  const p = [...pts].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (p.length < 3) return p;
  const lower: P2[] = [];
  for (const q of p) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], q) <= 0) lower.pop();
    lower.push(q);
  }
  const upper: P2[] = [];
  for (let i = p.length - 1; i >= 0; i--) {
    const q = p[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], q) <= 0) upper.pop();
    upper.push(q);
  }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}

/** Distanza con segno dal bordo del poligono convesso (positiva dentro). */
function signedMargin(poly: P2[], q: P2): number {
  if (poly.length < 3) {
    // Appoggio su un punto o su una linea: non sta in piedi da solo.
    return -Infinity;
  }
  let inside = Infinity;
  let outside = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    const d = cross(a, b, q) / len; // > 0 a sinistra del lato = dentro
    inside = Math.min(inside, d);
    if (d < 0) outside = Math.max(outside, -d);
  }
  return inside >= 0 ? inside : -outside;
}

/**
 * Stabilità del modello montato. `density(filamentId)` in g/cm³.
 * null se manca la geometria (mesh senza indici).
 */
export function stability(parts: StabilityPart[], density: (filamentId?: string) => number): Stability | null {
  if (!parts.length || parts.some((p) => !p.mesh?.indices)) return null;
  let minZ = Infinity;
  for (const p of parts) {
    const pos = p.mesh!.positions;
    for (let i = 2; i < pos.length; i += 3) minZ = Math.min(minZ, pos[i]);
  }
  let mass = 0;
  const com: Vec3 = [0, 0, 0];
  const base: P2[] = [];
  for (const p of parts) {
    const { c, v } = centroid(p.mesh!.positions, p.mesh!.indices!);
    const m = Math.abs(v) * density(p.filamentId);
    mass += m;
    for (let k = 0; k < 3; k++) com[k] += c[k] * m;
    const pos = p.mesh!.positions;
    for (let i = 0; i < pos.length; i += 3) if (pos[i + 2] <= minZ + STABILITY.contactMm) base.push([pos[i], pos[i + 1]]);
  }
  if (!mass) return null;
  for (let k = 0; k < 3; k++) com[k] /= mass;
  const marginMm = signedMargin(hull2(base), [com[0], com[1]]);
  const heightMm = com[2] - minZ;
  const tipDeg = marginMm > 0 ? (Math.atan2(marginMm, Math.max(heightMm, 0.01)) * 180) / Math.PI : 0;
  return { com, marginMm: Number.isFinite(marginMm) ? marginMm : -1, heightMm, tipDeg };
}
