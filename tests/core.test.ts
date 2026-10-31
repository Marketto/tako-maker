import { describe, expect, it } from 'vitest';
import { unzipSync, strFromU8 } from 'fflate';
import { applyOps, DesignError } from '../src/core/design/ops';
import { evaluateDesign, findContacts } from '../src/core/geometry/evaluate';
import { analyze, roundShape, sharpBoxes } from '../src/core/analysis';
import { estimateStrategies, isZStratified } from '../src/core/analysis/estimate';
import { build3MF } from '../src/core/export/threemf';
import { buildSTL } from '../src/core/export/stl';
import { planAssembly } from '../src/core/assembly/plan';
import { manifold, printer, setup, toyLaptop } from './fixtures';
import type { Design } from '../src/core/types';

const fil = new Set(setup.filaments.map((f) => f.id));

describe('operazioni sul design', () => {
  it('applica modifiche in modo atomico', () => {
    const d = toyLaptop();
    const d2 = applyOps(d, [{ op: 'update_part', id: 'keys', filamentId: 'f2' }, { op: 'set_meta', name: 'Laptop' }], fil);
    expect(d2.parts[1].filamentId).toBe('f2');
    expect(d2.name).toBe('Laptop');
    expect(d.parts[1].filamentId).toBe('f1');
    expect(() => applyOps(d, [{ op: 'set_meta', name: 'x' }, { op: 'remove_part', id: 'nope' }])).toThrow(DesignError);
  });
  it('rifiuta filamenti non disponibili e misure assurde', () => {
    const d = toyLaptop();
    expect(() => applyOps(d, [{ op: 'update_part', id: 'base', filamentId: 'zzz' }], fil)).toThrow(/non disponibile/);
    expect(() => applyOps(d, [{ op: 'update_part', id: 'base', shape: { op: 'box', size: [5000, 1, 1] } }])).toThrow(/limiti/);
  });
  it('rimuovere una parte rimuove i suoi giunti', () => {
    const d2 = applyOps(toyLaptop(), [{ op: 'remove_part', id: 'screen' }]);
    expect(d2.joints).toHaveLength(0);
  });
});

describe('geometria', () => {
  it('valuta il portatile con cerniera e scatti', async () => {
    const w = await manifold();
    const d = toyLaptop();
    d.joints[0].detent = { enabled: true, anglesDeg: [0, 100] };
    const r = evaluateDesign(w, d);
    expect(r.errors).toEqual([]);
    expect(r.parts).toHaveLength(3);
    for (const p of r.parts) {
      expect(p.volume).toBeGreaterThan(0);
      expect(p.mesh.indices.length % 3).toBe(0);
    }
  });
  it('arrotonda i box e riduce leggermente il volume', async () => {
    const w = await manifold();
    const sharp: Design = { ...toyLaptop(), joints: [], parts: [{ id: 'a', name: 'A', shape: { op: 'box', size: [20, 20, 20] } }] };
    const round: Design = { ...sharp, parts: [{ id: 'a', name: 'A', shape: roundShape(sharp.parts[0].shape) }] };
    const v1 = evaluateDesign(w, sharp).parts[0].volume;
    const v2 = evaluateDesign(w, round).parts[0].volume;
    expect(v1).toBeCloseTo(8000, 0);
    expect(v2).toBeLessThan(v1);
    expect(v2).toBeGreaterThan(7700);
  });
  it('non arrotonda i fori (nodi sottrattivi)', () => {
    const shape = { op: 'difference' as const, children: [{ op: 'box' as const, size: [20, 20, 20] as [number, number, number] }, { op: 'box' as const, size: [5, 5, 30] as [number, number, number] }] };
    expect(sharpBoxes(shape)).toBe(1);
    const r = roundShape(shape);
    expect(sharpBoxes(r)).toBe(0);
    expect((r as typeof shape).children[1]).toEqual(shape.children[1]);
  });
  it('aggiunge perni tra parti a contatto quando si stampa separato', async () => {
    const w = await manifold();
    const d: Design = {
      ...toyLaptop(),
      joints: [],
      parts: [
        { id: 'a', name: 'A', shape: { op: 'box', size: [40, 40, 10] } },
        { id: 'b', name: 'B', shape: { op: 'box', size: [40, 40, 10], at: [0, 0, 10] } },
      ],
      printPlan: { strategy: 'separate', connection: 'snap' },
    };
    const plain = evaluateDesign(w, { ...d, printPlan: { strategy: 'separate', connection: 'none' } });
    const pegged = evaluateDesign(w, d);
    expect(pegged.parts[0].volume).toBeGreaterThan(plain.parts[0].volume);
    expect(pegged.parts[1].volume).toBeLessThan(plain.parts[1].volume);
  });
  it('trova i contatti dai bounding box', () => {
    const c = findContacts([
      { id: 'a', box: { min: [0, 0, 0], max: [10, 10, 10] } },
      { id: 'b', box: { min: [0, 0, 10], max: [10, 10, 20] } },
      { id: 'c', box: { min: [50, 50, 50], max: [60, 60, 60] } },
    ]);
    expect(c).toHaveLength(1);
    expect(c[0]).toMatchObject({ a: 'a', b: 'b', axis: 2, dir: 1 });
  });
});

describe('analisi', () => {
  const stats = async (d: Design) => (await manifold()) && evaluateDesign(await manifold(), d).parts;

  it('propone il multicolore su una stampante con AMS', async () => {
    const d = toyLaptop();
    const parts = await stats(d);
    const r = analyze(d, parts, setup, printer('bambu-a1'), new Set());
    const keys = r.questions.map((q) => q.key.split(':')[0]);
    expect(keys).toContain('detent');
    expect(keys).toContain('round');
    expect(r.estimates.find((e) => e.strategy === 'multicolor')?.feasible).toBe(true);
  });
  it('senza sistema multicolore propone le parti separate e chiede il collegamento', async () => {
    const d = toyLaptop();
    d.joints = [];
    const parts = await stats(d);
    const r = analyze(d, parts, { ...setup, hasMulti: false }, printer('prusa-mini'), new Set());
    expect(r.recommended?.strategy).not.toBe('multicolor');
    expect(r.estimates.find((e) => e.strategy === 'multicolor')?.feasible).toBe(false);
  });
  it('non ripete domande già risposte', async () => {
    const d = toyLaptop();
    const parts = await stats(d);
    const first = analyze(d, parts, setup, printer('bambu-a1'), new Set());
    const again = analyze(d, parts, setup, printer('bambu-a1'), new Set(first.questions.map((q) => q.key)));
    expect(again.questions).toHaveLength(0);
  });
  it('riconosce i colori a fasce per il cambio a quota', () => {
    const p = (id: string, f: string, z0: number, z1: number) => ({ id, filamentId: f, volume: 1000, bbox: { min: [0, 0, z0] as [number, number, number], max: [10, 10, z1] as [number, number, number] } });
    expect(isZStratified([p('a', 'f1', 0, 5), p('b', 'f2', 5, 8)])).toBe(true);
    expect(isZStratified([p('a', 'f1', 0, 5), p('b', 'f2', 2, 8)])).toBe(false);
    const est = estimateStrategies([p('a', 'f1', 0, 5), p('b', 'f2', 5, 8)], { ...setup, hasMulti: false }, printer('prusa-mini'));
    expect(est.find((e) => e.strategy === 'layer-swap')?.feasible).toBe(true);
  });
});

describe('esportazione', () => {
  it('crea un 3MF valido per Orca/Bambu e per PrusaSlicer', async () => {
    const w = await manifold();
    const r = evaluateDesign(w, toyLaptop());
    const parts = r.parts.map((p, i) => ({ name: p.name, mesh: p.mesh, filament: setup.filaments[i], extruder: i + 1 }));
    for (const flavor of ['orca', 'prusa'] as const)
      for (const strategy of ['multicolor', 'separate'] as const) {
        const zip = unzipSync(build3MF(parts, { title: 'Test', flavor, strategy, bed: [256, 256, 256], attribution: { title: 'X', url: 'https://example.org', license: 'CC BY 4.0' } }));
        const model = strFromU8(zip['3D/3dmodel.model']);
        expect(model).toContain('<build>');
        expect(model).toContain('LicenseTerms');
        expect(zip['[Content_Types].xml']).toBeDefined();
        expect(Object.keys(zip).some((k) => k.startsWith('Metadata/') && k.endsWith('.config'))).toBe(true);
      }
  });
  it('crea un STL binario della dimensione attesa', async () => {
    const w = await manifold();
    const m = evaluateDesign(w, toyLaptop()).parts[0].mesh;
    expect(buildSTL(m).length).toBe(84 + (m.indices.length / 3) * 50);
  });
});

describe('montaggio', () => {
  it('ordina i passi partendo dalla base', async () => {
    const w = await manifold();
    const d = toyLaptop();
    d.printPlan = { strategy: 'separate', connection: 'glue' };
    const parts = evaluateDesign(w, d).parts;
    const plan = planAssembly(d, parts.map((p) => ({ id: p.id, box: p.contactBox })));
    expect(plan.steps[0].partId).toBe('base');
    expect(plan.steps).toHaveLength(3);
    expect(plan.steps.find((s) => s.partId === 'keys')?.text).toMatch(/colla/);
  });
});

describe('cerniere e colori', () => {
  it('senza multicolore propone di uniformare il colore delle parti incernierate', async () => {
    const w = await manifold();
    const d = toyLaptop();
    d.parts = d.parts.filter((p) => p.id !== 'keys');
    const parts = evaluateDesign(w, d).parts;
    const r = analyze(d, parts, { ...setup, hasMulti: false }, printer('prusa-mk4s'), new Set());
    expect(r.estimates.find((e) => e.strategy === 'separate')?.feasible).toBe(false);
    const q = r.questions.find((x) => x.key.startsWith('jointcolor'));
    expect(q?.options[0].ops).toEqual([{ op: 'update_part', id: 'screen', filamentId: 'f3' }]);
  });
});

describe('arrotondamento pezzi sottili', () => {
  it('dopo aver arrotondato non ripropone la domanda (anche per box sottili)', () => {
    const shape = { op: 'union' as const, children: [{ op: 'box' as const, size: [14, 12, 3] as [number, number, number] }, { op: 'box' as const, size: [100, 80, 10] as [number, number, number] }] };
    expect(sharpBoxes(shape)).toBe(2);
    expect(sharpBoxes(roundShape(shape))).toBe(0);
  });
});

describe('montaggio con cerniera', () => {
  it('la parte incernierata risulta unita alla base, senza animazione', async () => {
    const w = await manifold();
    const d = toyLaptop();
    d.parts = d.parts.filter((p) => p.id !== 'keys');
    d.parts[1].shape = { op: 'box', size: [160, 8, 100], at: [0, 102, 20] }; // non tocca la base
    d.printPlan = { strategy: 'separate', connection: 'glue' };
    const parts = evaluateDesign(w, d).parts;
    const plan = planAssembly(d, parts.map((p) => ({ id: p.id, box: p.contactBox })));
    const screen = plan.steps.find((s) => s.partId === 'screen')!;
    expect(screen.text).toMatch(/cerniera/);
    expect(screen.distance).toBe(0);
    expect(plan.loose).toHaveLength(0);
  });
});
