import type { Manifold, ManifoldToplevel } from 'manifold-3d';
import type { ShapeNode, Vec3 } from '../types';
import { FILLET } from '../../data/guidelines';

/* Raccordi tra le forme di una parte: dove due forme si toccano (un cilindro su una base, un braccio
   che entra in un corpo) l'app riempie lo spigolo rientrante con un raccordo, così il pezzo non
   sembra un insieme di forme appoggiate. Ogni forma semplice (box, cilindro, sfera, hull) è convessa:
   il raccordo è l'inviluppo convesso delle due fasce vicine al contatto, quindi si calcola in fretta.
   Due smussi con lati diversi, uniti, approssimano il quarto di cerchio (spezzata per il punto a 0,29·r).
   Il raccordo non riempie mai fori e tasche disegnati (si tolgono di nuovo) né lo spazio di altre parti
   (lo toglie chi chiama, con il gioco): i funzionamenti meccanici restano quelli disegnati. */

export interface FilletCtx {
  w: ManifoldToplevel;
  keep<T extends { delete(): void }>(m: T): T;
}

interface Leaf {
  m: Manifold;
  /** Spessore minimo della forma (mm): il raccordo non lo supera in proporzione. */
  thick: number;
}

type Transform = Pick<ShapeNode, 'rot' | 'at'>;

const CONVEX = new Set(['box', 'cylinder', 'sphere', 'hull']);

function thickness(n: ShapeNode): number {
  switch (n.op) {
    case 'box':
      return Math.min(...n.size);
    case 'cylinder':
      return Math.min(n.h, 2 * Math.min(n.r, n.r2 ?? n.r) || n.h);
    case 'sphere':
      return 2 * n.r;
    default:
      return Infinity;
  }
}

/** Forme convesse aggiunte e geometria sottratta, nelle coordinate della parte. */
function collect(ctx: FilletCtx, node: ShapeNode, build: (n: ShapeNode) => Manifold, chain: Transform[], subtractive: boolean, leaves: Leaf[], holes: Manifold[]) {
  const place = (m: Manifold) => {
    let out = m;
    for (const t of chain) {
      if (t.rot) out = ctx.keep(out.rotate(t.rot));
      if (t.at) out = ctx.keep(out.translate(t.at));
    }
    return out;
  };
  if (subtractive) {
    holes.push(place(build(node)));
    return;
  }
  if (CONVEX.has(node.op)) {
    const m = place(build(node));
    let thick = thickness(node);
    if (node.op === 'hull') {
      const b = m.boundingBox();
      thick = Math.min(...[0, 1, 2].map((k) => b.max[k] - b.min[k]));
    }
    leaves.push({ m, thick });
    return;
  }
  if (node.op === 'union' || node.op === 'difference') {
    const inner = [node, ...chain];
    node.children.forEach((c, i) => collect(ctx, c, build, inner, node.op === 'difference' && i > 0, leaves, holes));
  }
  // intersection e mesh: forme non convesse in generale, niente raccordi.
}

const DIRS: Vec3[] = (() => {
  const out: Vec3[] = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
  const s = 1 / Math.sqrt(3);
  for (const x of [-s, s]) for (const y of [-s, s]) for (const z of [-s, s]) out.push([x, y, z]);
  return out;
})();

/** Forma convessa allargata di `r` in tutte le direzioni (inviluppo di copie spostate). */
function dilate(ctx: FilletCtx, m: Manifold, r: number): Manifold {
  return ctx.keep(ctx.w.Manifold.hull([m, ...DIRS.map((d) => ctx.keep(m.translate([d[0] * r, d[1] * r, d[2] * r])))]));
}

function overlap(a: Manifold, b: Manifold, margin: number): boolean {
  const A = a.boundingBox();
  const B = b.boundingBox();
  return [0, 1, 2].every((k) => A.min[k] - margin <= B.max[k] && B.min[k] - margin <= A.max[k]);
}

/** Raccordo tra due forme convesse che si toccano; null se non si toccano. */
function pairFillet(ctx: FilletCtx, a: Leaf, b: Leaf, cap: number): Manifold | null {
  const r = Math.min(cap, FILLET.thickRatio * a.thick, FILLET.thickRatio * b.thick);
  if (r < FILLET.minMm || !overlap(a.m, b.m, r)) return null;
  const dA = dilate(ctx, a.m, r);
  const dB = dilate(ctx, b.m, r);
  // Si toccano davvero? (contatto o compenetrazione, non solo vicine)
  const touch = ctx.keep(a.m.intersect(dilate(ctx, b.m, 0.05)));
  if (touch.isEmpty() || touch.volume() < 1e-4) return null;
  const s = r * FILLET.innerLeg;
  const bandA = (d: number) => ctx.keep(a.m.intersect(d === r ? dB : dilate(ctx, b.m, d)));
  const bandB = (d: number) => ctx.keep(b.m.intersect(d === r ? dA : dilate(ctx, a.m, d)));
  const parts = [ctx.keep(ctx.w.Manifold.hull([bandA(r), bandB(s)])), ctx.keep(ctx.w.Manifold.hull([bandA(s), bandB(r)]))];
  // Le forme sono quelle disegnate, senza arrotondamento: il raccordo riempie anche il solco che
  // gli spigoli arrotondati lascerebbero dove una forma poggia sull'altra.
  const f = ctx.keep(ctx.keep(ctx.keep(ctx.w.Manifold.union(parts)).intersect(dA)).intersect(dB));
  return f.isEmpty() ? null : f;
}

/**
 * Raccordi tra le forme aggiunte di una parte. `shape` è la forma disegnata, senza arrotondamento.
 * `cap`: raggio massimo (mm). Restituisce null se non ce ne sono.
 * I fori e le tasche disegnati vengono tolti di nuovo dai raccordi.
 */
export function junctionFillets(ctx: FilletCtx, shape: ShapeNode, build: (n: ShapeNode) => Manifold, cap: number): Manifold | null {
  if (cap <= 0) return null;
  const leaves: Leaf[] = [];
  const holes: Manifold[] = [];
  collect(ctx, shape, build, [], false, leaves, holes);
  if (leaves.length < 2 || leaves.length > FILLET.maxShapes) return null;
  const out: Manifold[] = [];
  for (let i = 0; i < leaves.length; i++) {
    for (let j = i + 1; j < leaves.length; j++) {
      const f = pairFillet(ctx, leaves[i], leaves[j], cap);
      if (f) out.push(f);
    }
  }
  if (!out.length) return null;
  let all = ctx.keep(ctx.w.Manifold.union(out));
  if (holes.length) all = ctx.keep(all.subtract(ctx.keep(ctx.w.Manifold.union(holes))));
  return all.isEmpty() ? null : all;
}
