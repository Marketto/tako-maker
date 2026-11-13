import type { RawMesh } from '../geometry/evaluate';
import { settleIslands } from '../geometry/islands';
import type { Arrange } from './coupons';

/* Sistema sul piatto i pezzi di un campione dopo il calcolo:
   - asis: tutti insieme, appoggiati (cerniere stampate montate, campioni già disposti);
   - axis: asse del giunto in verticale con il perno di A verso l'alto, pezzi affiancati;
   - flat: pezzi affiancati, ciascuno nel verso (dritto o capovolto) con meno sporgenze da sostenere;
     i pezzetti staccati dal ritaglio scendono sul piatto invece di restare sospesi.
   Solo rotazioni (niente specchiature), così l'orientamento dei triangoli resta corretto. */

export interface Piece {
  name: string;
  mesh: RawMesh;
}

type Map3 = (x: number, y: number, z: number) => [number, number, number];

function transform(mesh: RawMesh, f: Map3): RawMesh {
  const p = mesh.positions;
  const out = new Float32Array(p.length);
  for (let i = 0; i < p.length; i += 3) {
    const [x, y, z] = f(p[i], p[i + 1], p[i + 2]);
    out[i] = x;
    out[i + 1] = y;
    out[i + 2] = z;
  }
  return { positions: out, indices: mesh.indices };
}

function bounds(mesh: RawMesh): { min: number[]; max: number[] } {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  const p = mesh.positions;
  for (let i = 0; i < p.length; i += 3)
    for (let k = 0; k < 3; k++) {
      min[k] = Math.min(min[k], p[i + k]);
      max[k] = Math.max(max[k], p[i + k]);
    }
  return { min, max };
}

/** Area delle facce rivolte verso il basso che non poggiano sul piatto (da sostenere). */
export function overhangArea(mesh: RawMesh): number {
  const p = mesh.positions;
  const idx = mesh.indices;
  const z0 = bounds(mesh).min[2];
  let area = 0;
  for (let t = 0; t < idx.length; t += 3) {
    const [a, b, c] = [idx[t] * 3, idx[t + 1] * 3, idx[t + 2] * 3];
    const u = [p[b] - p[a], p[b + 1] - p[a + 1], p[b + 2] - p[a + 2]];
    const v = [p[c] - p[a], p[c + 1] - p[a + 1], p[c + 2] - p[a + 2]];
    const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    const len = Math.hypot(n[0], n[1], n[2]);
    if (!len || n[2] > -0.7 * len) continue;
    if (Math.max(p[a + 2], p[b + 2], p[c + 2]) <= z0 + 0.3) continue;
    area += len / 2;
  }
  return area;
}

const flip: Map3 = (x, y, z) => [x, -y, -z]; // mezzo giro attorno a X

export function arrangePieces(pieces: Piece[], arrange: Arrange, gap = 4): { pieces: Piece[]; size: [number, number] } {
  const live = pieces.filter((p) => p.mesh.indices.length);
  if (!live.length) return { pieces: [], size: [0, 0] };
  if (arrange.mode === 'asis') {
    const all = live.map((p) => bounds(p.mesh));
    const min = [0, 1, 2].map((k) => Math.min(...all.map((b) => b.min[k])));
    const max = [0, 1, 2].map((k) => Math.max(...all.map((b) => b.max[k])));
    return {
      pieces: live.map((p) => ({ name: p.name, mesh: transform(p.mesh, (x, y, z) => [x - min[0], y - min[1], z - min[2]]) })),
      size: [max[0] - min[0], max[1] - min[1]],
    };
  }
  let oriented: RawMesh[];
  if (arrange.mode === 'axis') {
    const a = arrange.axis;
    const u = (a + 1) % 3;
    const v = (a + 2) % 3;
    // Permutazione ciclica (u, v, asse) → (x, y, z); con dir −1 mezzo giro in più attorno a y.
    const s = arrange.dir;
    oriented = live.map((p) =>
      transform(p.mesh, (...c) => [s * c[u], c[v], s * c[a]]),
    );
  } else {
    oriented = live.map((p) => {
      const turned = transform(p.mesh, flip);
      return overhangArea(turned) < overhangArea(p.mesh) - 1 ? turned : p.mesh;
    });
  }
  let x = 0;
  let depth = 0;
  const out: Piece[] = oriented.map((m, i) => {
    const b = bounds(m);
    const dx = x - b.min[0];
    x += b.max[0] - b.min[0] + gap;
    depth = Math.max(depth, b.max[1] - b.min[1]);
    const placed = transform(m, (px, py, pz) => [px + dx, py - b.min[1], pz - b.min[2]]);
    return { name: live[i].name, mesh: arrange.mode === 'flat' ? settleIslands(placed) : placed };
  });
  return { pieces: out, size: [x - gap, depth] };
}
