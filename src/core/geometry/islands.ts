import type { RawMesh } from './evaluate';

/* Pezzi staccati di una stessa parte (es. due ganci disegnati a quote diverse).
   Stampando la parte da sola, ognuno deve poggiare sul piatto: altrimenti lo slicer
   lo vede "fluttuante" e lo regge con i supporti per tutta l'altezza. */

/** Per ogni vertice, l'indice del pezzo (insieme di triangoli collegati) a cui appartiene. */
function componentOf(m: RawMesh): { comp: Int32Array; count: number } {
  const n = m.positions.length / 3;
  const parent = new Int32Array(n).map((_, i) => i);
  const find = (x: number): number => {
    while (parent[x] !== x) x = parent[x] = parent[parent[x]];
    return x;
  };
  const join = (a: number, b: number) => {
    const ra = find(a), rb = find(b);
    if (ra !== rb) parent[ra] = rb;
  };
  const ix = m.indices;
  for (let t = 0; t < ix.length; t += 3) {
    join(ix[t], ix[t + 1]);
    join(ix[t], ix[t + 2]);
  }
  const ids = new Map<number, number>();
  const comp = new Int32Array(n);
  for (let i = 0; i < n; i++) {
    const r = find(i);
    if (!ids.has(r)) ids.set(r, ids.size);
    comp[i] = ids.get(r)!;
  }
  return { comp, count: ids.size };
}

type Box = { min: number[]; max: number[] };

function boxesOf(m: RawMesh, comp: Int32Array, count: number): Box[] {
  const p = m.positions;
  const box = Array.from({ length: count }, () => ({ min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] }));
  for (let i = 0; i < comp.length; i++) {
    const b = box[comp[i]];
    for (let k = 0; k < 3; k++) {
      b.min[k] = Math.min(b.min[k], p[i * 3 + k]);
      b.max[k] = Math.max(b.max[k], p[i * 3 + k]);
    }
  }
  return box;
}

/**
 * Divide una mesh nei pezzi da posare ciascuno sul piatto: il primo contiene tutto ciò che
 * poggia già sul piatto, gli altri sono i pezzi sospesi sopra un altro pezzo (che non possono
 * scendere in verticale). I gusci contenuti in un altro pezzo (cavità, perni dentro un anello)
 * restano con il pezzo che li contiene. Una mesh senza pezzi sospesi torna intera.
 */
export function splitFloating(m: RawMesh): RawMesh[] {
  const { comp, count } = componentOf(m);
  if (count < 2) return [m];
  const box = boxesOf(m, comp, count);
  const inside = (a: Box, b: Box) => [0, 1, 2].every((k) => a.min[k] >= b.min[k] - 0.01 && a.max[k] <= b.max[k] + 0.01);
  const vol = (b: Box) => (b.max[0] - b.min[0]) * (b.max[1] - b.min[1]) * (b.max[2] - b.min[2]);
  // Ogni pezzo va con il più piccolo che lo contiene, risalendo fino a un pezzo libero.
  const parent = box.map((b, c) => {
    let best = -1;
    box.forEach((o, j) => {
      if (j !== c && inside(b, o) && !(inside(o, b) && j > c) && (best < 0 || vol(o) < vol(box[best]))) best = j;
    });
    return best;
  });
  const root = (c: number): number => {
    for (let n = 0; parent[c] >= 0 && n < count; n++) c = parent[c];
    return c;
  };
  const bedZ = Math.min(...box.map((b) => b.min[2]));
  const group = new Map<number, number>(); // pezzo libero → gruppo
  for (let c = 0; c < count; c++) {
    if (parent[c] >= 0) continue;
    group.set(c, box[c].min[2] <= bedZ + 0.05 ? 0 : -1);
  }
  let next = 1;
  for (const [c, g] of group) if (g < 0) group.set(c, next++);
  if (next === 1) return [m];
  const of = Array.from({ length: count }, (_, c) => group.get(root(c))!);
  const ix = m.indices;
  return Array.from({ length: next }, (_, g) => {
    const remap = new Map<number, number>();
    const pos: number[] = [];
    const idx: number[] = [];
    for (let t = 0; t < ix.length; t += 3) {
      if (of[comp[ix[t]]] !== g) continue;
      for (let k = 0; k < 3; k++) {
        const v = ix[t + k];
        let n = remap.get(v);
        if (n === undefined) {
          n = remap.size;
          remap.set(v, n);
          pos.push(m.positions[v * 3], m.positions[v * 3 + 1], m.positions[v * 3 + 2]);
        }
        idx.push(n);
      }
    }
    return { positions: new Float32Array(pos), indices: new Uint32Array(idx) };
  }).filter((p) => p.indices.length);
}

/**
 * Abbassa sul piatto i pezzi staccati che stanno più in alto del resto della parte, purché
 * sotto di loro (in pianta) non ci sia un altro pezzo. Restituisce la mesh originale se non
 * c'è nulla da spostare.
 */
export function settleIslands(m: RawMesh): RawMesh {
  const { comp, count } = componentOf(m);
  if (count < 2) return m;
  const p = m.positions;
  const box = boxesOf(m, comp, count);
  const bedZ = Math.min(...box.map((b) => b.min[2]));
  const footprintsTouch = (a: (typeof box)[number], b: (typeof box)[number]) =>
    a.min[0] < b.max[0] + 0.01 && b.min[0] < a.max[0] + 0.01 && a.min[1] < b.max[1] + 0.01 && b.min[1] < a.max[1] + 0.01;
  const drop = box.map((b, c) => (b.min[2] > bedZ + 0.05 && !box.some((o, j) => j !== c && footprintsTouch(b, o)) ? b.min[2] - bedZ : 0));
  if (drop.every((d) => d === 0)) return m;
  const out = new Float32Array(p);
  for (let i = 0; i < comp.length; i++) out[i * 3 + 2] -= drop[comp[i]];
  return { positions: out, indices: m.indices };
}
