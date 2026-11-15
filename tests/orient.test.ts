import { describe, expect, it } from 'vitest';
import { evaluateDesign, type OrientInput } from '../src/core/geometry/evaluate';
import { applyRot, candidateDowns, isDesignDown, orientedMeshes, rotationToDown, supportColumns } from '../src/core/geometry/orient';
import { analyze } from '../src/core/analysis';
import { applyOps } from '../src/core/design/ops';
import { orientInputFor } from '../src/core/plate';
import type { Design, Vec3 } from '../src/core/types';
import { manifold, printer, setup } from './fixtures';

/**
 * Come il «cruscotto da bracciolo»: ripiano in alto, due pareti che scendono e, in fondo a ognuna,
 * un bordo che sporge verso l'esterno. Disegnato nella posizione d'uso. Capovolto, i bordi restano
 * in alto a sbalzo: servono supporti alti 80 mm sotto una striscia larga 10 mm (fragili).
 */
function dashboard(orient?: Record<string, Vec3>): Design {
  return {
    version: 1,
    name: 'Cruscotto',
    intendedUse: { children: true },
    joints: [],
    parts: [
      {
        id: 'c',
        name: 'Cruscotto',
        filamentId: 'f1',
        shape: {
          op: 'union',
          children: [
            { op: 'box', size: [120, 100, 5], at: [0, 0, 80] },
            { op: 'box', size: [4, 100, 80], at: [0, 0, 0] },
            { op: 'box', size: [4, 100, 80], at: [116, 0, 0] },
            { op: 'box', size: [14, 100, 5], at: [-10, 0, 0] },
            { op: 'box', size: [14, 100, 5], at: [116, 0, 0] },
          ],
        },
      },
    ],
    printPlan: { strategy: 'single', connection: 'none', orient },
  };
}

const p1s = printer('bambu-p1s');
const input = (d: Design): OrientInput => orientInputFor(d, setup, p1s);

async function evalDash(orient?: Record<string, Vec3>) {
  const w = await manifold();
  const d = dashboard(orient);
  return { d, r: evaluateDesign(w, d, {}, {}, input(d)) };
}

describe('rotazioni', () => {
  it('portano la direzione scelta verso il piatto, senza specchiare', () => {
    for (const d of [[0, 0, -1], [0, 0, 1], [1, 0, 0], [0, -1, 0], [0.3, -0.5, 0.8]] as Vec3[]) {
      const r = rotationToDown(d);
      const n = Math.hypot(...d);
      const v = applyRot(r, d.map((x) => x / n) as Vec3);
      expect(v[0]).toBeCloseTo(0, 6);
      expect(v[1]).toBeCloseTo(0, 6);
      expect(v[2]).toBeCloseTo(-1, 6);
      const det = r[0] * (r[4] * r[8] - r[5] * r[7]) - r[1] * (r[3] * r[8] - r[5] * r[6]) + r[2] * (r[3] * r[7] - r[4] * r[6]);
      expect(det).toBeCloseTo(1, 6);
    }
  });
});

describe('come appoggiarlo sul piatto', () => {
  it('stima i supporti e trova quelli alti e stretti', async () => {
    const { r } = await evalDash();
    const g = r.printStats.orient![0];
    expect(g.key).toBe('*');
    const drawn = g.options.find((o) => isDesignDown(o.down))!;
    const flipped = g.options.find((o) => o.down[2] > 0.99)!;
    // Nel disegno: tanti supporti sotto il ripiano, ma su una zona larga.
    expect(drawn.supportMm3).toBeGreaterThan(500_000);
    expect(drawn.risky).toHaveLength(0);
    // Capovolto: pochi supporti, ma alti e sotto due strisce strette.
    expect(flipped.supportMm3).toBeLessThan(drawn.supportMm3 / 3);
    expect(flipped.risky.length).toBe(2);
    expect(flipped.supportMaxH).toBeGreaterThan(75);
    // La scelta automatica non ha supporti fragili e costa meno del disegno.
    const pick = g.options[g.chosen];
    expect(pick.risky).toHaveLength(0);
    expect(pick.supportMm3).toBeLessThan(drawn.supportMm3);
  });

  it('rispetta la posizione scelta, avvisa e propone di cambiarla', async () => {
    const { d, r } = await evalDash({ '*': [0, 0, 1] });
    const g = r.printStats.orient![0];
    expect(g.options[g.chosen].down).toEqual([0, 0, 1]);
    const report = analyze(d, r.parts, setup, p1s, new Set(), { printStats: r.printStats });
    expect(report.warnings.some((w) => w.includes('piegarsi'))).toBe(true);
    const q = report.questions.find((x) => x.key.startsWith('orient:*'));
    expect(q).toBeTruthy();
    const next = applyOps(d, q!.options[0].ops!);
    expect(next.printPlan.orient?.['*']).toEqual(g.options.find((o) => !o.risky.length && o.fits && o === g.options.filter((x) => !x.risky.length && x.fits).sort((a, b) => a.score - b.score)[0])!.down);
  });

  it('esporta le parti già girate', async () => {
    const { r } = await evalDash({ '*': [0, 0, 1] });
    const [part] = orientedMeshes(r.parts.map((p) => ({ id: p.id, mesh: p.mesh })), r.printStats.orient!);
    // Capovolto: il ripiano (z 80..85 nel disegno) finisce in basso.
    let minZ = Infinity, maxZ = -Infinity;
    for (let i = 2; i < part.mesh.positions.length; i += 3) {
      minZ = Math.min(minZ, part.mesh.positions[i]);
      maxZ = Math.max(maxZ, part.mesh.positions[i]);
    }
    expect(maxZ - minZ).toBeCloseTo(85, 1);
    expect(minZ).toBeCloseTo(-85, 1);
  });

  it('con cerniere stampate montate resta la posizione del disegno', async () => {
    const w = await manifold();
    const d = dashboard();
    d.parts.push({ id: 'k', name: 'Coperchio', filamentId: 'f1', shape: { op: 'box', size: [40, 30, 4], at: [40, 30, 85] } });
    d.joints.push({ id: 'j', type: 'hinge', partA: 'c', partB: 'k', axis: 'x', origin: [60, 30, 87], length: 30, radius: 3 });
    const r = evaluateDesign(w, d, {}, {}, input(d));
    const g = r.printStats.orient![0];
    expect(isDesignDown(g.options[g.chosen].down)).toBe(true);
  });

  it('le facce piatte grandi diventano posizioni candidate', () => {
    // Prisma con una faccia inclinata grande
    const positions = new Float32Array([0, 0, 0, 10, 0, 0, 0, 10, 0, 0, 0, 10]);
    const indices = new Uint32Array([0, 2, 1, 0, 1, 3, 0, 3, 2, 1, 2, 3]);
    const downs = candidateDowns({ positions, indices });
    expect(downs.some((d) => Math.abs(d[0] - d[1]) < 0.01 && Math.abs(d[1] - d[2]) < 0.01 && d[0] > 0.5)).toBe(true);
  });

  it('senza sporgenze nessun supporto', () => {
    // Cubo 10 mm appoggiato
    const positions = new Float32Array([0, 0, 0, 10, 0, 0, 10, 10, 0, 0, 10, 0, 0, 0, 10, 10, 0, 10, 10, 10, 10, 0, 10, 10]);
    const indices = new Uint32Array([0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7, 0, 1, 5, 0, 5, 4, 1, 2, 6, 1, 6, 5, 2, 3, 7, 2, 7, 6, 3, 0, 4, 3, 4, 7]);
    expect(supportColumns({ positions, indices }, 45).volume).toBe(0);
  });
});
