import { describe, expect, it } from 'vitest';
import { evaluateDesign, pointToZ, spreadPoints } from '../src/core/geometry/evaluate';
import { analyze } from '../src/core/analysis';
import { applyOps } from '../src/core/design/ops';
import { planAssembly } from '../src/core/assembly/plan';
import type { Design, ShapeNode, Vec3 } from '../src/core/types';
import { manifold, printer, setup } from './fixtures';

/** Scatola cava in due metà: fondo aperto in alto, coperchio aperto in basso. */
function hollowBox(wall: number, connection: 'snap' | 'glue' = 'snap'): Design {
  const shell = (h: number, z: number, openTop: boolean): ShapeNode => ({
    op: 'difference',
    at: [0, 0, z],
    children: [
      { op: 'box', size: [80, 50, h] },
      { op: 'box', size: [80 - 2 * wall, 50 - 2 * wall, h], at: [wall, wall, openTop ? 3 : -3] },
    ],
  });
  return {
    version: 1,
    name: 'Scatola',
    intendedUse: { children: false },
    parts: [
      { id: 'fondo', name: 'Fondo', filamentId: 'f1', shape: shell(30, 0, true) },
      { id: 'coperchio', name: 'Coperchio', filamentId: 'f1', shape: shell(12, 30, false) },
    ],
    joints: [],
    printPlan: { strategy: 'separate', connection },
  };
}

describe('perni lungo i bordi', () => {
  it('mette più perni sul bordo di una scatola cava con pareti spesse', async () => {
    const w = await manifold();
    const r = evaluateDesign(w, hollowBox(7));
    expect(r.errors).toEqual([]);
    const c = r.connectors[0];
    expect(c.pegs).toBeGreaterThanOrEqual(2);
    // Il perno sta nel bordo: il coperchio perde volume (fori), il fondo ne guadagna (perni)
    const plain = evaluateDesign(w, { ...hollowBox(7), printPlan: { strategy: 'separate', connection: 'none' } });
    expect(r.parts[0].volume).toBeGreaterThan(plain.parts[0].volume);
    expect(r.parts[1].volume).toBeLessThan(plain.parts[1].volume);
  });
  it('con pareti troppo sottili non mette perni e lo segnala', async () => {
    const w = await manifold();
    const d = hollowBox(2);
    const r = evaluateDesign(w, d);
    expect(r.connectors[0].pegs).toBe(0);
    const rep = analyze(d, r.parts, setup, printer('bambu-a1'), new Set(), r);
    expect(rep.warnings.join(' ')).toMatch(/non ho potuto mettere perni/);
  });
  it('funziona anche con contatto laterale (asse X e Y)', async () => {
    const w = await manifold();
    for (const axis of [0, 1] as const) {
      const at: Vec3 = [0, 0, 0];
      at[axis] = 40;
      const d: Design = {
        version: 1, name: 'x', intendedUse: { children: false }, joints: [],
        parts: [
          { id: 'a', name: 'A', filamentId: 'f1', shape: { op: 'box', size: [40, 40, 30] } },
          { id: 'b', name: 'B', filamentId: 'f1', shape: { op: 'box', size: [40, 40, 30], at } },
        ],
        printPlan: { strategy: 'separate', connection: 'glue' },
      };
      const r = evaluateDesign(w, d);
      expect(r.connectors[0].pegs).toBeGreaterThanOrEqual(2);
      expect(r.parts[0].volume).toBeGreaterThan(48000);
      expect(r.parts[1].volume).toBeLessThan(48000);
    }
  });
  it('i punti scelti sono distribuiti agli estremi', () => {
    const pts: [number, number][] = [];
    for (let x = 0; x <= 100; x += 5) pts.push([x, 0], [x, 50]);
    const s = spreadPoints(pts, 2, 10);
    expect(Math.hypot(s[0][0] - s[1][0], s[0][1] - s[1][1])).toBeGreaterThan(100);
  });
  it('la trasformazione verso Z è coerente', () => {
    expect(pointToZ([1, 2, 3], 0, 1)).toEqual([-3, 2, 1]);
    expect(pointToZ([1, 2, 3], 1, 1)).toEqual([1, -3, 2]);
    expect(pointToZ([1, 2, 3], 2, -1)).toEqual([1, -2, -3]);
  });
  it('la guida di montaggio indica il numero di perni', async () => {
    const w = await manifold();
    const d = hollowBox(7);
    const r = evaluateDesign(w, d);
    const plan = planAssembly(d, r.parts.map((p) => ({ id: p.id, box: p.contactBox })), 'snap', r.connectors);
    expect(plan.steps[1].text).toMatch(new RegExp(`i ${r.connectors[0].pegs} perni`));
  });
});

describe('coerenza della forma', () => {
  const two = (b: ShapeNode): Design => ({
    version: 1, name: 'x', intendedUse: { children: false }, joints: [],
    parts: [
      { id: 'grande', name: 'Grande', filamentId: 'f1', shape: { op: 'box', size: [60, 60, 20] } },
      { id: 'piccolo', name: 'Piccolo', filamentId: 'f1', shape: b },
    ],
    printPlan: { strategy: 'separate', connection: 'none' },
  });
  it('propone la sede per parti che si compenetrano e la risolve', async () => {
    const w = await manifold();
    const d = two({ op: 'box', size: [20, 20, 20], at: [20, 20, 10] });
    const r = evaluateDesign(w, d);
    expect(r.overlaps).toHaveLength(1);
    const q = analyze(d, r.parts, setup, printer('bambu-a1'), new Set(), r).questions.find((x) => x.key.startsWith('overlap'))!;
    const fixed = applyOps(d, q.options[0].ops!);
    expect(evaluateDesign(w, fixed).overlaps).toHaveLength(0);
  });
  it('propone di chiudere un piccolo spazio', async () => {
    const w = await manifold();
    const d = two({ op: 'box', size: [60, 60, 5], at: [0, 0, 20.8] });
    const r = evaluateDesign(w, d);
    const q = analyze(d, r.parts, setup, printer('bambu-a1'), new Set(), r).questions.find((x) => x.key.startsWith('gap'))!;
    expect(q.text).toMatch(/0,8 mm/);
    const fixed = applyOps(d, q.options[0].ops!);
    const r2 = evaluateDesign(w, fixed);
    expect(r2.parts[1].bbox.min[2]).toBeCloseTo(20, 3);
  });
  it('propone di allineare bordi sfalsati con la stessa sagoma', async () => {
    const w = await manifold();
    const d = two({ op: 'box', size: [60, 60, 5], at: [1.5, 0, 20] });
    const r = evaluateDesign(w, d);
    const q = analyze(d, r.parts, setup, printer('bambu-a1'), new Set(), r).questions.find((x) => x.key.startsWith('align'))!;
    const fixed = applyOps(d, q.options[0].ops!);
    expect(evaluateDesign(w, fixed).parts[1].bbox.min[0]).toBeCloseTo(0, 3);
  });
  it('avvisa se le sagome sono quasi uguali ma non combaciano', async () => {
    const w = await manifold();
    const d = two({ op: 'box', size: [58, 60, 5], at: [0, 0, 20] });
    const r = evaluateDesign(w, d);
    expect(analyze(d, r.parts, setup, printer('bambu-a1'), new Set(), r).warnings.join(' ')).toMatch(/non combaciano/);
  });
});
