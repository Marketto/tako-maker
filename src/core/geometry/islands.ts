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

/**
 * Abbassa sul piatto i pezzi staccati che stanno più in alto del resto della parte, purché
 * sotto di loro (in pianta) non ci sia un altro pezzo. Restituisce la mesh originale se non
 * c'è nulla da spostare.
 */
export function settleIslands(m: RawMesh): RawMesh {
  const { comp, count } = componentOf(m);
  if (count < 2) return m;
  const p = m.positions;
  const box = Array.from({ length: count }, () => ({ min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] }));
  for (let i = 0; i < comp.length; i++) {
    const b = box[comp[i]];
    for (let k = 0; k < 3; k++) {
      b.min[k] = Math.min(b.min[k], p[i * 3 + k]);
      b.max[k] = Math.max(b.max[k], p[i * 3 + k]);
    }
  }
  const bedZ = Math.min(...box.map((b) => b.min[2]));
  const footprintsTouch = (a: (typeof box)[number], b: (typeof box)[number]) =>
    a.min[0] < b.max[0] + 0.01 && b.min[0] < a.max[0] + 0.01 && a.min[1] < b.max[1] + 0.01 && b.min[1] < a.max[1] + 0.01;
  const drop = box.map((b, c) => (b.min[2] > bedZ + 0.05 && !box.some((o, j) => j !== c && footprintsTouch(b, o)) ? b.min[2] - bedZ : 0));
  if (drop.every((d) => d === 0)) return m;
  const out = new Float32Array(p);
  for (let i = 0; i < comp.length; i++) out[i * 3 + 2] -= drop[comp[i]];
  return { positions: out, indices: m.indices };
}
