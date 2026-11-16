import { describe, expect, it } from 'vitest';
import type { Manifold, ManifoldToplevel } from 'manifold-3d';
import { evaluateDesign, type EvalResult } from '../src/core/geometry/evaluate';
import type { Design, StylePrefs } from '../src/core/types';
import { manifold } from './fixtures';

/** Torretta: base, cilindro sopra con un foro, braccio che entra nel cilindro; accanto un coperchio separato. */
function tower(style?: StylePrefs): Design {
  return {
    version: 1,
    name: 'Torretta',
    intendedUse: { children: false },
    style,
    parts: [
      {
        id: 'corpo',
        name: 'Corpo',
        shape: {
          op: 'difference',
          children: [
            {
              op: 'union',
              children: [
                { op: 'box', size: [60, 40, 10] },
                { op: 'cylinder', h: 30, r: 10, at: [30, 20, 10] },
                { op: 'box', size: [30, 8, 8], at: [30, 16, 25] },
              ],
            },
            // Foro passante nel cilindro: deve restare vuoto.
            { op: 'cylinder', h: 50, r: 4, at: [30, 20, -5] },
          ],
        },
      },
      // Coperchio appoggiato alla base, vicino alla torretta: i raccordi non devono invaderlo.
      { id: 'coperchio', name: 'Coperchio', shape: { op: 'box', size: [12, 40, 6], at: [45, 0, 10] } },
    ],
    joints: [],
    printPlan: { strategy: 'separate', connection: 'none' },
  };
}

const solid = (w: ManifoldToplevel, r: EvalResult, id: string): Manifold => {
  const p = r.parts.find((x) => x.id === id)!;
  return new w.Manifold(new w.Mesh({ numProp: 3, vertProperties: p.mesh.positions, triVerts: p.mesh.indices }));
};
const filled = (w: ManifoldToplevel, m: Manifold, at: [number, number, number]) => m.intersect(w.Manifold.cube([0.4, 0.4, 0.4], true).translate(at)).volume() > 0.03;

describe('raccordi tra le forme', () => {
  it('riempie lo spigolo tra base e cilindro e tra cilindro e braccio', async () => {
    const w = await manifold();
    const t0 = performance.now();
    const r = evaluateDesign(w, tower({ round: true, smooth: true }));
    const ms = performance.now() - t0;
    expect(r.errors).toEqual([]);
    const body = solid(w, r, 'corpo');
    // Appena fuori dal cilindro, appena sopra la base, sul lato senza coperchio.
    expect(filled(w, body, [30, 20 - 10.7, 10.7])).toBe(true);
    // Sotto il braccio, appena fuori dal cilindro.
    expect(filled(w, body, [40.8, 20, 24.6])).toBe(true);
    // Senza preferenza: niente raccordi.
    const plain = solid(w, evaluateDesign(w, tower()), 'corpo');
    expect(filled(w, plain, [30, 20 - 10.7, 10.7])).toBe(false);
    expect(ms).toBeLessThan(8000);
  });

  it('non riempie i fori disegnati né lo spazio delle altre parti', async () => {
    const w = await manifold();
    const r = evaluateDesign(w, tower({ round: true, smooth: true }));
    const body = solid(w, r, 'corpo');
    const hole = w.Manifold.cylinder(60, 3.9, 3.9, 32).translate([30, 20, -10]);
    expect(body.intersect(hole).volume()).toBeLessThan(0.01);
    const lid = solid(w, r, 'coperchio');
    // Il coperchio resta staccato almeno del gioco.
    expect(body.intersect(lid.translate([-0.3, 0, 0])).volume()).toBeLessThan(0.01);
  });
});
