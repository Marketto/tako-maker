import { describe, expect, it } from 'vitest';
import { settleIslands } from '../src/core/geometry/islands';
import { bodyStats } from '../src/core/geometry/evaluate';

/** Cubi di lato s con l'angolo in (x, y, z), in un'unica mesh. */
function cubes(...list: [number, number, number, number][]) {
  const pos: number[] = [];
  const idx: number[] = [];
  const tri = [0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7, 0, 1, 5, 0, 5, 4, 1, 2, 6, 1, 6, 5, 2, 3, 7, 2, 7, 6, 3, 0, 4, 3, 4, 7];
  for (const [s, x, y, z] of list) {
    const base = pos.length / 3;
    pos.push(...[0, 0, 0, s, 0, 0, s, s, 0, 0, s, 0, 0, 0, s, s, 0, s, s, s, s, 0, s, s].map((c, i) => c + [x, y, z][i % 3]));
    idx.push(...tri.map((t) => t + base));
  }
  return { positions: new Float32Array(pos), indices: new Uint32Array(idx) };
}

const minZ = (m: { positions: Float32Array }, from: number, to: number) => Math.min(...[...m.positions.slice(from * 3, to * 3)].filter((_, i) => i % 3 === 2));

describe('pezzi staccati di una parte stampata da sola', () => {
  it('due ganci a quote diverse: quello più alto scende sul piatto', () => {
    const m = cubes([10, 0, 0, 20], [10, 30, 0, 26]);
    const out = settleIslands(m);
    expect(minZ(out, 8, 16)).toBe(20);
    expect(bodyStats(m, 20).floating).toBe(false);
    // Prima: il fondo del secondo cubo è una sporgenza; dopo: poggia sul piatto.
    expect(bodyStats(out, 20).contactArea).toBeCloseTo(200);
    expect(bodyStats(out, 20).overhang.reduce((a, b) => a + b, 0)).toBe(0);
  });

  it('un pezzo sopra un altro (in pianta si sovrappongono) resta dov’è', () => {
    const m = cubes([10, 0, 0, 0], [6, 2, 2, 15]);
    expect(settleIslands(m)).toBe(m);
  });

  it('una parte in un solo pezzo non cambia', () => {
    const m = cubes([10, 0, 0, 5]);
    expect(settleIslands(m)).toBe(m);
  });
});
