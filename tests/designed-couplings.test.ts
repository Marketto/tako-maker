import { describe, expect, it } from 'vitest';
import { evaluateDesign } from '../src/core/geometry/evaluate';
import { analyze } from '../src/core/analysis';
import { fitPairs } from '../src/core/calibration/coupons';
import type { Design } from '../src/core/types';
import { manifold, printer, setup } from './fixtures';

/** Volante con una spina disegnata a mano che entra nel foro del supporto, senza giunto. */
function handMade(): Design {
  return {
    version: 1,
    name: 'Volante',
    intendedUse: { children: true },
    parts: [
      { id: 'supporto', name: 'Supporto', filamentId: 'f1', shape: { op: 'difference', children: [{ op: 'box', size: [30, 30, 20] }, { op: 'cylinder', h: 12, r: 4.2, at: [15, 15, 9] }] } },
      { id: 'volante', name: 'Volante', filamentId: 'f2', shape: { op: 'union', children: [{ op: 'cylinder', h: 6, r: 20, at: [15, 15, 20] }, { op: 'cylinder', h: 10, r: 4, at: [15, 15, 10] }] } },
    ],
    joints: [],
    printPlan: { strategy: 'separate', connection: 'designed' },
  };
}

async function warnings(d: Design) {
  const r = evaluateDesign(await manifold(), d);
  return analyze(d, r.parts, setup, printer('bambu-a1'), new Set(), r).warnings.filter((w) => w.includes('agganci disegnati'));
}

describe('agganci disegnati a mano tra parti separate', () => {
  it('senza giunto né campione: avvisa e indica le parti', async () => {
    const w = await warnings(handMade());
    expect(w).toHaveLength(1);
    expect(w[0]).toContain('"Volante" – "Supporto"');
  });

  it('il campione «Aggancio» trova anche la spina del pezzo grande nel foro del pezzo piccolo', async () => {
    const d = handMade();
    const r = evaluateDesign(await manifold(), d);
    const pairs = fitPairs(d, Object.fromEntries(r.parts.map((p) => [p.id, { ...p.bbox, mesh: p.mesh }])));
    expect(pairs).toHaveLength(1);
    // Zona del campione attorno alla spina, non tutto il volante.
    expect(pairs[0].region.max[2]).toBeLessThan(26);
    expect(pairs[0].region.min[2]).toBeGreaterThanOrEqual(5);
  });

  it('con un giunto tra le due parti: nessun avviso', async () => {
    const d = handMade();
    d.joints = [{ id: 'sterzo', type: 'rotary', partA: 'supporto', partB: 'volante', axis: 'z', origin: [15, 15, 15], radius: 6 }];
    expect(await warnings(d)).toEqual([]);
  });

  it('con incastri generati dall\'app: nessun avviso', async () => {
    const d = handMade();
    d.printPlan.connection = 'snap';
    expect(await warnings(d)).toEqual([]);
  });
});
