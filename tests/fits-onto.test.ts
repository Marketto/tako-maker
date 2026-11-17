import { describe, expect, it } from 'vitest';
import { evaluateDesign } from '../src/core/geometry/evaluate';
import { analyze } from '../src/core/analysis';
import { applyOps } from '../src/core/design/ops';
import type { Design } from '../src/core/types';
import { manifold, printer, setup } from './fixtures';

/** Pinza a U per una sponda spessa 18 mm. */
function clamp(): Design {
  return {
    version: 1,
    name: 'Supporto',
    intendedUse: { children: false },
    parts: [
      {
        id: 'pinza',
        name: 'Pinza',
        shape: { op: 'difference', children: [{ op: 'box', size: [30, 28, 40] }, { op: 'box', size: [40, 18, 30], at: [-5, 5, 12] }] },
      },
    ],
    joints: [],
    printPlan: { strategy: 'single', connection: 'none' },
  };
}

async function warnings(d: Design) {
  const r = evaluateDesign(await manifold(), d);
  return analyze(d, r.parts, setup, printer('bambu-a1'), new Set(), r).warnings;
}

describe('aggancio a un oggetto esistente', () => {
  it('set_meta imposta e toglie fitsOnto', () => {
    const d = applyOps(clamp(), [{ op: 'set_meta', fitsOnto: '  sponda del letto  ' }]);
    expect(d.intendedUse.fitsOnto).toBe('sponda del letto');
    expect(applyOps(d, [{ op: 'set_meta', fitsOnto: null }]).intendedUse.fitsOnto).toBeUndefined();
  });

  it('senza prova di misura avvisa; con la prova no', async () => {
    const d = applyOps(clamp(), [{ op: 'set_meta', fitsOnto: 'sponda del letto' }]);
    expect((await warnings(d)).some((w) => w.includes('sponda del letto'))).toBe(true);
    const withSample = applyOps(d, [
      { op: 'add_sample', sample: { id: 'pinza', name: 'Fetta della pinza', check: 'Calzala sulla sponda', regions: [{ part: 'pinza', min: [0, -1, -1], max: [8, 29, 41] }] } },
    ]);
    expect((await warnings(withSample)).some((w) => w.includes('sponda del letto'))).toBe(false);
    expect((await warnings(clamp())).some((w) => w.includes('campione'))).toBe(false);
  });
});
