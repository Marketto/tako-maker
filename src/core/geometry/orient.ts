import type { Vec3 } from '../types';
import { bodyStats, overhangBeyond, type BodyStats, type RawMesh } from './evaluate';
import { RISKY_SUPPORT_MM, RISKY_SUPPORT_RATIO, SUPPORT_FILL } from '../../data/guidelines';

/* Come appoggiare un corpo sul piatto.
   Si provano le sei facce del riquadro e le facce piatte più grandi del pezzo; per ognuna si stimano
   i supporti con una griglia in pianta: sotto ogni sporgenza oltre l'angolo del materiale c'è una
   colonna che scende fino al piatto o alla superficie del pezzo più vicina. Si segnalano le zone
   «fragili»: supporti alti sotto una zona stretta (es. un'ala inclinata), che durante la stampa
   si piegano o si staccano. Solo rotazioni: l'orientamento dei triangoli resta corretto. */

/** Matrice di rotazione 3×3 per righe. */
export type Mat3 = [number, number, number, number, number, number, number, number, number];

export const DESIGN_DOWN: Vec3 = [0, 0, -1];
const ID: Mat3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];

export interface SupportZone {
  /** Area in pianta (mm²). */
  area: number;
  /** Altezza massima dei supporti (mm). */
  height: number;
  /** Larghezza tipica della zona (mm). */
  width: number;
}

export interface OrientOption {
  /** Direzione (nelle coordinate del disegno) che va verso il piatto. */
  down: Vec3;
  rot: Mat3;
  /** Appoggio e sporgenze in questa posizione. */
  stats: BodyStats;
  /** Volume stimato del materiale dei supporti (mm³). */
  supportMm3: number;
  /** Altezza massima dei supporti (mm). */
  supportMaxH: number;
  /** Zone con supporti alti e stretti: rischiano di cedere. */
  risky: SupportZone[];
  /** Altezza del pezzo sul piatto (mm). */
  height: number;
  /** Entra nel piatto (anche girandolo di 90° in pianta). */
  fits: boolean;
  /** Più basso è meglio. */
  score: number;
}

const same = (a: Vec3, b: Vec3, cos = 0.999) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2] > cos;

/** Rotazione che porta la direzione `d` verso il basso (0, 0, −1). */
export function rotationToDown(d: Vec3): Mat3 {
  const len = Math.hypot(...d);
  const [x, y, z] = d.map((v) => v / len);
  if (z < -0.999999) return ID;
  if (z > 0.999999) return [1, 0, 0, 0, -1, 0, 0, 0, -1]; // mezzo giro attorno a X
  // Rodrigues: asse k = d × t (t = (0,0,−1)), cos = d·t
  const c = -z;
  const kx = -y, ky = x; // d × (0,0,−1) = (−y, x, 0)
  const s = Math.hypot(kx, ky);
  const ux = kx / s, uy = ky / s;
  const v = 1 - c;
  return [c + ux * ux * v, ux * uy * v, uy * s, ux * uy * v, c + uy * uy * v, -ux * s, -uy * s, ux * s, c];
}

export function applyRot(r: Mat3, [x, y, z]: Vec3): Vec3 {
  return [r[0] * x + r[1] * y + r[2] * z, r[3] * x + r[4] * y + r[5] * z, r[6] * x + r[7] * y + r[8] * z];
}

/** Ruota la mesh e (con `settle`) la appoggia a z = 0. */
export function rotateMesh(m: RawMesh, r: Mat3, settle = true): RawMesh {
  const p = m.positions;
  const out = new Float32Array(p.length);
  let minZ = Infinity;
  for (let i = 0; i < p.length; i += 3) {
    const [x, y, z] = applyRot(r, [p[i], p[i + 1], p[i + 2]]);
    out[i] = x;
    out[i + 1] = y;
    out[i + 2] = z;
    minZ = Math.min(minZ, z);
  }
  if (settle) for (let i = 2; i < out.length; i += 3) out[i] -= minZ;
  return { positions: out, indices: m.indices };
}

/** Facce del riquadro più le normali delle facce piatte grandi (almeno il 4% della superficie). */
export function candidateDowns(m: RawMesh, max = 4): Vec3[] {
  const out: Vec3[] = [[0, 0, -1], [0, 0, 1], [1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0]];
  const p = m.positions;
  const ix = m.indices;
  const groups = new Map<string, { n: Vec3; area: number }>();
  let total = 0;
  for (let t = 0; t < ix.length; t += 3) {
    const a = ix[t] * 3, b = ix[t + 1] * 3, c = ix[t + 2] * 3;
    const ux = p[b] - p[a], uy = p[b + 1] - p[a + 1], uz = p[b + 2] - p[a + 2];
    const vx = p[c] - p[a], vy = p[c + 1] - p[a + 1], vz = p[c + 2] - p[a + 2];
    const n: Vec3 = [uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx];
    const len = Math.hypot(...n);
    if (len < 1e-9) continue;
    const area = len / 2;
    total += area;
    const u = n.map((v) => v / len) as Vec3;
    const key = u.map((v) => Math.round(v * 40)).join(',');
    const g = groups.get(key);
    if (g) g.area += area;
    else groups.set(key, { n: u, area });
  }
  const big = [...groups.values()].filter((g) => g.area >= total * 0.04).sort((a, b) => b.area - a.area);
  for (const g of big) {
    if (out.length >= 6 + max) break;
    if (!out.some((d) => same(d, g.n, 0.996))) out.push(g.n);
  }
  return out;
}

/**
 * Supporti stimati per una mesh già appoggiata a z = 0: volume delle colonne sotto le sporgenze
 * oltre `overhangDeg` (gradi dalla verticale) e zone fragili.
 */
export function supportColumns(m: RawMesh, overhangDeg: number, cell = 2): { volume: number; maxH: number; zones: SupportZone[] } {
  const p = m.positions;
  const ix = m.indices;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let i = 0; i < p.length; i += 3) {
    x0 = Math.min(x0, p[i]); x1 = Math.max(x1, p[i]);
    y0 = Math.min(y0, p[i + 1]); y1 = Math.max(y1, p[i + 1]);
  }
  if (!Number.isFinite(x0)) return { volume: 0, maxH: 0, zones: [] };
  const nx = Math.max(1, Math.ceil((x1 - x0) / cell)), ny = Math.max(1, Math.ceil((y1 - y0) / cell));
  const floors: number[][] = Array.from({ length: nx * ny }, () => []);
  const ceils: number[][] = Array.from({ length: nx * ny }, () => []);
  const sinLimit = Math.sin((overhangDeg * Math.PI) / 180);

  for (let t = 0; t < ix.length; t += 3) {
    const a = ix[t] * 3, b = ix[t + 1] * 3, c = ix[t + 2] * 3;
    const ux = p[b] - p[a], uy = p[b + 1] - p[a + 1], uz = p[b + 2] - p[a + 2];
    const vx = p[c] - p[a], vy = p[c + 1] - p[a + 1], vz = p[c + 2] - p[a + 2];
    const nX = uy * vz - uz * vy, nY = uz * vx - ux * vz, nZ = ux * vy - uy * vx;
    const len = Math.hypot(nX, nY, nZ);
    if (len < 1e-9) continue;
    const z = nZ / len;
    let target: number[][] | null = null;
    if (z > 0.05) target = floors;
    else if (-z > sinLimit && (p[a + 2] + p[b + 2] + p[c + 2]) / 3 > 0.3) target = ceils;
    if (!target) continue;
    // Celle il cui centro cade nel triangolo (in pianta), con la quota interpolata.
    const ax = p[a], ay = p[a + 1], bx = p[b], by = p[b + 1], cx = p[c], cy = p[c + 1];
    const det = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy);
    if (Math.abs(det) < 1e-12) continue;
    const i0 = Math.max(0, Math.floor((Math.min(ax, bx, cx) - x0) / cell)), i1 = Math.min(nx - 1, Math.floor((Math.max(ax, bx, cx) - x0) / cell));
    const j0 = Math.max(0, Math.floor((Math.min(ay, by, cy) - y0) / cell)), j1 = Math.min(ny - 1, Math.floor((Math.max(ay, by, cy) - y0) / cell));
    let hit = false;
    for (let i = i0; i <= i1; i++)
      for (let j = j0; j <= j1; j++) {
        const px = x0 + (i + 0.5) * cell, py = y0 + (j + 0.5) * cell;
        const l1 = ((by - cy) * (px - cx) + (cx - bx) * (py - cy)) / det;
        const l2 = ((cy - ay) * (px - cx) + (ax - cx) * (py - cy)) / det;
        const l3 = 1 - l1 - l2;
        if (l1 < -1e-6 || l2 < -1e-6 || l3 < -1e-6) continue;
        target[i * ny + j].push(l1 * p[a + 2] + l2 * p[b + 2] + l3 * p[c + 2]);
        hit = true;
      }
    // Triangolo più piccolo di una cella: conta nella cella del baricentro.
    if (!hit && target === ceils) {
      const i = Math.min(nx - 1, Math.max(0, Math.floor(((ax + bx + cx) / 3 - x0) / cell)));
      const j = Math.min(ny - 1, Math.max(0, Math.floor(((ay + by + cy) / 3 - y0) / cell)));
      const share = (Math.abs(det) / 2) / (cell * cell);
      if (share > 0.25) target[i * ny + j].push((p[a + 2] + p[b + 2] + p[c + 2]) / 3);
    }
  }

  const colH = new Float32Array(nx * ny);
  let volume = 0;
  for (let k = 0; k < colH.length; k++) {
    for (const zc of ceils[k]) {
      let floor = 0;
      for (const zf of floors[k]) if (zf < zc - 0.2 && zf > floor) floor = zf;
      const h = zc - floor;
      if (h < 0.5) continue;
      volume += h * cell * cell;
      colH[k] = Math.max(colH[k], h);
    }
  }

  // Zone: celle sostenute collegate (4 vicini). Larghezza tipica = 2·area / perimetro.
  const zones: SupportZone[] = [];
  const seen = new Uint8Array(nx * ny);
  let maxH = 0;
  for (let k = 0; k < colH.length; k++) {
    maxH = Math.max(maxH, colH[k]);
    if (!colH[k] || seen[k]) continue;
    const stack = [k];
    seen[k] = 1;
    let n = 0, edges = 0, h = 0;
    while (stack.length) {
      const q = stack.pop()!;
      n++;
      h = Math.max(h, colH[q]);
      const i = Math.floor(q / ny), j = q % ny;
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const a = i + di, b = j + dj;
        const r = a * ny + b;
        if (a < 0 || b < 0 || a >= nx || b >= ny || !colH[r]) {
          edges++;
          continue;
        }
        if (!seen[r]) {
          seen[r] = 1;
          stack.push(r);
        }
      }
    }
    const area = n * cell * cell;
    zones.push({ area, height: h, width: (2 * area) / (edges * cell) });
  }
  return { volume, maxH, zones };
}

/** La zona è fragile: supporti alti e stretti. */
export const isRisky = (z: SupportZone) => z.height >= RISKY_SUPPORT_MM && z.height >= RISKY_SUPPORT_RATIO * z.width;

/** Grammi approssimativi del materiale dei supporti. */
export const supportGrams = (mm3: number, density = 1.24) => (mm3 * SUPPORT_FILL * density) / 1000;

export interface OrientParams {
  overhangDeg: number;
  bridgeMm: number;
  bed: Vec3;
  /** Prepara la mesh ruotata prima della misura (es. pezzi staccati che scendono sul piatto). */
  settle?: (m: RawMesh) => RawMesh;
}

/** Valuta una posizione. */
export function evaluateOrientation(m: RawMesh, down: Vec3, o: OrientParams): OrientOption & { mesh: RawMesh } {
  const rot = rotationToDown(down);
  const mesh = (o.settle ?? ((x) => x))(rotateMesh(m, rot));
  const stats = bodyStats(mesh, 0);
  const cols = supportColumns(mesh, o.overhangDeg);
  // I ponti corti si stampano senza supporti: la stima si riduce nella stessa proporzione.
  const all = overhangBeyond(stats, o.overhangDeg);
  const ratio = all > 0 ? overhangBeyond(stats, o.overhangDeg, o.bridgeMm) / all : 0;
  const supportMm3 = cols.volume * ratio;
  const risky = ratio > 0 ? cols.zones.filter(isRisky) : [];
  const size = [0, 1, 2].map((k) => {
    let lo = Infinity, hi = -Infinity;
    for (let i = k; i < mesh.positions.length; i += 3) {
      lo = Math.min(lo, mesh.positions[i]);
      hi = Math.max(hi, mesh.positions[i]);
    }
    return hi - lo;
  });
  const [bx, by, bz] = o.bed;
  const fits = size[2] <= bz && ((size[0] <= bx && size[1] <= by) || (size[1] <= bx && size[0] <= by));
  const score = (fits ? 0 : 1e6) + supportGrams(supportMm3) + risky.length * 150 + (stats.floating ? 500 : 0) + size[2] * 0.05;
  return { down, rot, stats, supportMm3, supportMaxH: ratio > 0 ? cols.maxH : 0, risky, height: size[2], fits, score, mesh };
}

/** Ultimi risultati: scegliere una posizione o cambiare colore non cambia la geometria, non serve ricalcolare. */
const cache = new Map<string, OrientOption[]>();

/** Impronta della mesh: numero di vertici e un campione delle coordinate. */
function meshKey(m: RawMesh): string {
  const p = m.positions;
  const step = Math.max(1, Math.floor(p.length / 997));
  let h = 0;
  for (let i = 0; i < p.length; i += step) h = (h * 31 + Math.round(p[i] * 1000)) | 0;
  return `${p.length}:${m.indices.length}:${h}`;
}

/** Le posizioni possibili, la migliore per prima; quella del disegno c'è sempre. */
export function orientOptions(m: RawMesh, o: OrientParams): OrientOption[] {
  const key = `${meshKey(m)}|${o.overhangDeg}|${o.bridgeMm}|${o.bed.join(',')}|${o.settle ? 1 : 0}`;
  const hit = cache.get(key);
  if (hit) return [...hit];
  const list = candidateDowns(m)
    .map((d) => {
      const { mesh: _mesh, ...opt } = evaluateOrientation(m, d, o);
      return opt;
    })
    .sort((a, b) => a.score - b.score);
  cache.set(key, list);
  if (cache.size > 24) cache.delete(cache.keys().next().value!);
  return [...list];
}

/** Indice della posizione scelta: quella voluta dall'utente, altrimenti la migliore (o quella del disegno). */
export function pickOrientation(options: OrientOption[], wanted?: Vec3, preferDesign = false): number {
  const target = wanted ?? (preferDesign ? DESIGN_DOWN : undefined);
  if (target) {
    const i = options.findIndex((x) => same(x.down, target, 0.996));
    if (i >= 0) return i;
  }
  return 0;
}

export const isDesignDown = (d: Vec3) => same(d, DESIGN_DOWN, 0.996);

/**
 * Le mesh delle parti nella posizione scelta per la stampa: con il modello montato (`*`) girano
 * tutte insieme (restano al loro posto tra loro), le parti separate ognuna per conto suo.
 */
export function orientedMeshes<T extends { id: string; mesh: RawMesh }>(parts: T[], groups: { key: string; options: OrientOption[]; chosen: number }[]): T[] {
  const all = groups.find((g) => g.key === '*');
  const rotOf = (id: string) => {
    if (all) return { rot: all.options[all.chosen]?.rot, settle: false };
    const g = groups.find((x) => x.key === id);
    return { rot: g?.options[g.chosen]?.rot, settle: true };
  };
  return parts.map((p) => {
    const { rot, settle } = rotOf(p.id);
    return rot && !isIdentity(rot) ? { ...p, mesh: rotateMesh(p.mesh, rot, settle) } : p;
  });
}

const isIdentity = (r: Mat3) => r.every((v, i) => Math.abs(v - ID[i]) < 1e-9);
