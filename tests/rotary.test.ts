import { describe, expect, it } from 'vitest';
import type { Manifold, ManifoldToplevel } from 'manifold-3d';
import { evaluateDesign, type EvalResult } from '../src/core/geometry/evaluate';
import { analyze } from '../src/core/analysis';
import { planAssembly } from '../src/core/assembly/plan';
import { applyOps, DesignError } from '../src/core/design/ops';
import { printedTogether } from '../src/core/design/links';
import type { Design, Joint, PrintStrategy } from '../src/core/types';
import { manifold, printer, setup } from './fixtures';

const ORIENT = { bed: [256, 256, 256] as [number, number, number], overhangDeg: {}, bridgeMm: {} };

/** Volante con mozzo sopra un piantone; con `crank` il piantone ha un braccio a L che passa sotto il volante. */
function wheel(strategy: PrintStrategy, joint: Partial<Joint> = {}, crank = true): Design {
  return {
    version: 1,
    name: 'Volante',
    intendedUse: { children: false },
    parts: [
      {
        id: 'piantone',
        name: 'Piantone',
        filamentId: 'f1',
        shape: crank
          ? { op: 'union', children: [{ op: 'cylinder', h: 40, r: 8, at: [0, 0, 20] }, { op: 'box', size: [80, 16, 16], at: [-80, -8, 4] }, { op: 'cylinder', h: 30, r: 6, at: [-72, 0, -26] }] }
          : { op: 'cylinder', h: 60, r: 8 },
      },
      {
        id: 'volante',
        name: 'Volante',
        filamentId: 'f1',
        shape: {
          op: 'union',
          children: [
            { op: 'difference', at: [0, 0, 60], children: [{ op: 'cylinder', h: 10, r: 60 }, { op: 'cylinder', h: 12, r: 50, at: [0, 0, -1] }] },
            { op: 'cylinder', h: 14, r: 12, at: [0, 0, 60] },
            { op: 'box', size: [100, 8, 8], at: [-50, -4, 60] },
          ],
        },
      },
    ],
    joints: [{ id: 'sterzo', type: 'rotary', partA: 'piantone', partB: 'volante', axis: 'z', origin: [0, 0, 60], radius: 8, ...joint }],
    printPlan: { strategy, connection: 'none' },
  };
}

/** Piatto girevole: due dischi uno sopra l'altro, si stampa già montato senza supporti. */
function turntable(): Design {
  return {
    version: 1,
    name: 'Girevole',
    intendedUse: { children: false },
    parts: [
      { id: 'base', name: 'Base', filamentId: 'f1', shape: { op: 'cylinder', h: 10, r: 40 } },
      { id: 'piatto', name: 'Piatto', filamentId: 'f1', shape: { op: 'cylinder', h: 10, r: 40, at: [0, 0, 10] } },
    ],
    joints: [{ id: 'perno', type: 'rotary', partA: 'base', partB: 'piatto', axis: 'z', origin: [0, 0, 10], radius: 10 }],
    printPlan: { strategy: 'single', connection: 'none' },
  };
}

const solid = (w: ManifoldToplevel, r: EvalResult, id: string): Manifold => {
  const p = r.parts.find((x) => x.id === id)!;
  return new w.Manifold(new w.Mesh({ numProp: 3, vertProperties: p.mesh.positions, triVerts: p.mesh.indices }));
};

/** A e B non si toccano e B non si sfila allontanandosi da A lungo l'asse. */
function expectFreeAndHeld(w: ManifoldToplevel, r: EvalResult, a: string, b: string) {
  const A = solid(w, r, a);
  const B = solid(w, r, b);
  expect(A.intersect(B).volume()).toBeLessThan(0.01);
  // Spinto di 0,2 mm verso A non tocca: c'è gioco anche sulle facce, non si saldano.
  expect(A.intersect(B.translate([0, 0, -0.2])).volume()).toBeLessThan(0.01);
  // Tirato via di 1 mm urta il fermo del perno.
  expect(A.intersect(B.translate([0, 0, 1])).volume()).toBeGreaterThan(1);
}

describe('perno rotante', () => {
  it('piatto girevole: già montato, con gioco e testa che lo trattiene', async () => {
    const w = await manifold();
    const r = evaluateDesign(w, turntable(), {}, {}, ORIENT);
    expect(r.errors).toEqual([]);
    expect(r.jointModes).toEqual({ perno: 'in-place' });
    expectFreeAndHeld(w, r, 'base', 'piatto');
  });

  it('volante con manovella a L: l\'app sceglie due pezzi a scatto', async () => {
    const w = await manifold();
    const d = wheel('separate');
    const r = evaluateDesign(w, d, {}, {}, ORIENT);
    expect(r.errors).toEqual([]);
    expect(r.jointModes).toEqual({ sterzo: 'snap' });
    // Due pezzi da stampare separati, ognuno nella sua posizione migliore.
    expect(printedTogether(d, r.jointModes)).toEqual([]);
    expect(r.printStats.orient?.map((g) => g.key).sort()).toEqual(['piantone', 'volante']);
    expectFreeAndHeld(w, r, 'piantone', 'volante');
    // Il perno è spaccato: tra le due lamelle, appena sotto la punta, non c'è materiale.
    const A = solid(w, r, 'piantone');
    const probe = w.Manifold.cube([0.6, 0.6, 1], true).translate([0, 0, 74.5]);
    expect(A.intersect(probe).volume()).toBeLessThan(0.01);
  });

  it('con la stampa unica lo scatto non si applica e l\'analisi propone le parti separate', async () => {
    const w = await manifold();
    const d = wheel('single');
    const r = evaluateDesign(w, d, {}, {}, ORIENT);
    expect(r.jointModes).toEqual({ sterzo: 'snap' });
    expect(printedTogether(d, r.jointModes)).toHaveLength(1);
    expectFreeAndHeld(w, r, 'piantone', 'volante');
    const rep = analyze(d, r.parts, setup, printer('bambu-a1'), new Set(), r);
    expect(rep.recommended?.strategy).toBe('separate');
    expect(rep.estimates.find((e) => e.strategy === 'single')?.reason).toMatch(/due pezzi da montare a scatto/);
    const q = rep.questions.find((x) => x.key.startsWith('strategy:separate'));
    expect(q?.options[0].ops).toEqual([{ op: 'set_plan', strategy: 'separate' }]);
  });

  it('parti separate: niente domanda sul collegamento né perni tra i pezzi del giunto; il montaggio spiega lo scatto', async () => {
    const w = await manifold();
    const d = wheel('separate');
    const r = evaluateDesign(w, d, {}, {}, ORIENT);
    const rep = analyze(d, r.parts, setup, printer('bambu-a1'), new Set(), r);
    expect(rep.questions.some((x) => x.key.startsWith('connection:'))).toBe(false);
    expect(r.connectors).toEqual([]);
    const plan = planAssembly(d, r.parts.map((p) => ({ id: p.id, box: p.contactBox })), 'none', r.connectors, r.jointModes);
    expect(plan.steps[1].text).toMatch(/premi finché scatta/);
    expect(plan.steps[1].distance).toBeGreaterThan(0);
    expect(Math.abs(plan.steps[1].approach[2])).toBe(1);
  });

  it('la scelta dell\'utente vince su quella dell\'app', async () => {
    const w = await manifold();
    const r = evaluateDesign(w, wheel('separate', { print: 'in-place' }), {}, {}, ORIENT);
    expect(r.jointModes).toEqual({ sterzo: 'in-place' });
    expectFreeAndHeld(w, r, 'piantone', 'volante');
  });

  it('errore chiaro se l\'asse non attraversa la parte che ruota', async () => {
    const w = await manifold();
    const r = evaluateDesign(w, wheel('single', { origin: [30, 30, 60] }, false));
    expect(r.errors.join(' ')).toMatch(/non attraversa la parte che ruota/);
  });

  it('"print" vale solo per i giunti rotary', () => {
    const d = wheel('single', {}, false);
    expect(() => applyOps(d, [{ op: 'update_joint', id: 'sterzo', patch: { print: 'snap' } }])).not.toThrow();
    expect(() => applyOps(d, [{ op: 'update_joint', id: 'sterzo', patch: { type: 'hinge', print: 'snap' } }])).toThrow(DesignError);
    expect(() => applyOps(d, [{ op: 'update_joint', id: 'sterzo', patch: { print: 'loose' } }])).toThrow(DesignError);
  });
});
