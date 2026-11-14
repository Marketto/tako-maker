import { describe, expect, it } from 'vitest';
import { strFromU8, unzipSync } from 'fflate';
import { evaluateDesign } from '../src/core/geometry/evaluate';
import { analyze } from '../src/core/analysis';
import { layoutPlates, materialsToTest, neededTests, planSamples, seriesCoupons, testValues } from '../src/core/calibration/coupons';
import { arrangePieces, overhangArea } from '../src/core/calibration/arrange';
import { applyOps } from '../src/core/design/ops';
import { buildCalibrationFiles } from '../src/core/calibration/export';
import { tolerancesByPart, tolerancesFor } from '../src/core/calibration/tolerances';
import { bondsPoorly, minWall } from '../src/data/guidelines';
import { printerBlock } from '../src/agent/context';
import type { Design, Part, ShapeNode, UserSetup } from '../src/core/types';
import type { RawMesh } from '../src/core/geometry/evaluate';
import { manifold, printer, setup, toyLaptop } from './fixtures';

const evalFn = async (d: Design, tol: Record<string, ReturnType<typeof tolerancesFor>>) => evaluateDesign(await manifold(), d, {}, tol).parts;

describe('tolleranze per materiale', () => {
  it('PETG ha giochi più larghi del PLA; i valori calibrati vincono', () => {
    expect(tolerancesFor('PETG').hingeGap).toBeGreaterThan(tolerancesFor('PLA').hingeGap);
    const s: UserSetup = { ...setup, tolerances: { PLA: { hingeGap: 0.33 } } };
    expect(tolerancesFor('PLA', s).hingeGap).toBe(0.33);
  });
  it('la geometria della cerniera cambia con la tolleranza', async () => {
    const w = await manifold();
    const d = toyLaptop();
    const tight = evaluateDesign(w, d, {}, tolerancesByPart(d, { ...setup, tolerances: { PETG: { hingeGap: 0.2, pinClearance: 0.15 } } }));
    const loose = evaluateDesign(w, d, {}, tolerancesByPart(d, { ...setup, tolerances: { PETG: { hingeGap: 0.6, pinClearance: 0.55 } } }));
    const vol = (r: typeof tight) => r.parts.find((p) => p.id === 'base')!.volume;
    expect(vol(loose)).toBeLessThan(vol(tight));
  });
});

/** Base con due supporti a incastro (uguali), una ruota che gira e una manovella con scatto. */
function consolle(): Design {
  const support = (id: string, y: number, h: number): Part => ({
    id,
    name: `Supporto ${id}`,
    filamentId: 'f1',
    shape: { op: 'union', children: [{ op: 'box', size: [24, 24, 4], at: [8, y, 20] }, { op: 'box', size: [16, 16, 6], at: [12, y + 4, 14] }, { op: 'box', size: [12, 12, h], at: [14, y + 6, 24] }] },
  });
  const sockets: ShapeNode[] = [0, 40].map((y) => ({ op: 'box', size: [16.4, 16.4, 7], at: [11.8, y + 3.8, 13.5] }) as ShapeNode);
  return {
    version: 1,
    name: 'Consolle',
    intendedUse: { children: true },
    parts: [
      { id: 'base', name: 'Base', filamentId: 'f2', shape: { op: 'difference', children: [{ op: 'box', size: [40, 70, 20] }, ...sockets] } },
      support('s1', 0, 30),
      support('s2', 40, 20),
      { id: 'ruota', name: 'Ruota', filamentId: 'f1', shape: { op: 'cylinder', h: 8, r: 12, at: [20, 6, 54], rot: [90, 0, 0] } },
      { id: 'leva', name: 'Leva', filamentId: 'f1', shape: { op: 'cylinder', h: 6, r: 9, at: [20, 46, 40], rot: [90, 0, 0] } },
    ],
    joints: [
      { id: 'sterzo', type: 'rotary', partA: 's1', partB: 'ruota', axis: 'y', origin: [20, 6, 50], length: 10, radius: 5, detent: { enabled: false } },
      { id: 'scatto', type: 'rotary', partA: 's2', partB: 'leva', axis: 'y', origin: [20, 46, 38], length: 8, radius: 4, detent: { enabled: true } },
    ],
    printPlan: { strategy: 'separate', connection: 'designed' },
  };
}

const c0 = (s: { id: string }) => (s.id.endsWith('sterzo') ? 's1' : 's2');
const boxesOf = async (d: Design) => Object.fromEntries(evaluateDesign(await manifold(), d).parts.map((p) => [p.id, { ...p.bbox, mesh: p.mesh }]));

describe('campioni di prova', () => {
  it('servono per cerniere, scatti e incastri', () => {
    const d = toyLaptop();
    expect(neededTests(d)).toEqual(['hinge']);
    d.joints[0].detent = { enabled: true };
    d.printPlan = { strategy: 'separate', connection: 'snap' };
    expect(neededTests(d)).toEqual(['hinge', 'detent', 'snap']);
  });
  it('3 valori centrati sul consigliato del materiale', () => {
    const v = testValues('hinge', 'PLA');
    expect(v).toHaveLength(3);
    expect(v[1]).toBe(tolerancesFor('PLA').hingeGap);
  });
  it('trova le parti incerte: un giunto per tipo, un aggancio ripetuto una volta sola, le prove dichiarate', async () => {
    const d = consolle();
    d.samples = [{ id: 'fetta', name: 'Fetta della base', regions: [{ part: 'base', min: [-1, 20, -1], max: [41, 30, 21] }] }];
    const bx = await boxesOf(d);
    const plan = planSamples(d, setup, bx);
    expect(plan.map((s) => [s.id, s.values?.length ?? 1])).toEqual([
      ['rotary:sterzo', 3],
      ['detent:scatto', 3],
      ['fit:base|s1', 1],
      ['sample:fetta', 1],
    ]);
    expect(plan[0].name).toMatch(/Ruota/);
    expect(plan[1].name).toMatch(/Leva/);
  });
  it('i campioni sono pezzi del modello sistemati sul piatto', async () => {
    const d = consolle();
    d.samples = [{ id: 'fetta', name: 'Fetta della base', regions: [{ part: 'base', min: [-1, 20, -1], max: [41, 30, 21] }] }];
    const files = await buildCalibrationFiles(d, setup, printer('prusa-mk4s'), evalFn, await boxesOf(d));
    expect(files.filename).toBe('campioni-pla.3mf');
    expect(files.series.map((s) => s.id)).toEqual(['rotary:sterzo', 'detent:scatto', 'fit:base|s1', 'sample:fetta']);
    expect(files.readme).toMatch(/Ruota/);
    expect(files.readme).toMatch(/Fetta della base/);
    const model = strFromU8(unzipSync(files.data)['3D/3dmodel.model']);
    // Un solo pezzo con il perno per serie: (1 + 3) + (1 + 3) pezzi per i giunti, 2 per l'aggancio, 1 per la fetta.
    // Il ritaglio del supporto della leva lascia una briciola di 1,2 mm: si scarta.
    expect(model.match(/<object /g)!.length).toBe(4 + 4 + 2 + 1);
    expect(files.readme).toMatch(/Un solo pezzo con il perno/);
  }, 120_000);
  it('perno rotante: asse in verticale, perno in alto, pezzo forato accanto', async () => {
    const d = consolle();
    const w = await manifold();
    const s = planSamples(d, setup, await boxesOf(d))[0];
    const c = seriesCoupons(s)[0];
    const r = evaluateDesign(w, c.design, {}, c.tol);
    expect(r.errors).toEqual([]);
    const placed = arrangePieces(r.parts.map((p) => ({ name: p.name, mesh: p.mesh })), c.arrange);
    expect(placed.pieces).toHaveLength(2);
    const bb = (i: number) => {
      const p = placed.pieces[i].mesh.positions;
      const min = [Infinity, Infinity, Infinity];
      const max = [-Infinity, -Infinity, -Infinity];
      for (let k = 0; k < p.length; k++) {
        min[k % 3] = Math.min(min[k % 3], p[k]);
        max[k % 3] = Math.max(max[k % 3], p[k]);
      }
      return { min, max };
    };
    const [a, b] = [bb(0), bb(1)];
    expect(a.min[2]).toBeCloseTo(0, 3);
    expect(b.min[2]).toBeCloseTo(0, 3);
    expect(b.min[0]).toBeGreaterThan(a.max[0]); // accanto, non infilato
    // Il perno sporge sopra il blocco di A: la parte più alta di A è stretta (il perno).
    const p = placed.pieces[0].mesh.positions;
    let lo = Infinity, hi = -Infinity;
    for (let k = 0; k < p.length; k += 3) if (p[k + 2] > a.max[2] - 0.5) [lo, hi] = [Math.min(lo, p[k]), Math.max(hi, p[k])];
    expect(hi - lo).toBeLessThan((a.max[0] - a.min[0]) / 2);
  });
  it('il perno è uguale nelle 3 varianti: si stampa una volta sola', async () => {
    const d = consolle();
    const [rot, det] = planSamples(d, setup, await boxesOf(d));
    for (const s of [rot, det]) {
      expect(s.sharedPin).toBe(true);
      expect(seriesCoupons(s).map((c) => c.drop)).toEqual([undefined, [c0(s)], [c0(s)]]);
    }
    // Prova del gioco su un giunto con scatto: il dentino del perno si sposta col gioco, quindi niente perno condiviso.
    d.joints = [d.joints[1]];
    const only = planSamples(d, setup, await boxesOf(d)).find((s) => s.kind === 'rotary')!;
    expect(only.sharedPin).toBe(false);
    expect(seriesCoupons(only).every((c) => !c.drop)).toBe(true);
  });
    it('flat: ogni pezzo nel verso con meno sporgenze', async () => {
    // Una T (gambo sotto, piano sopra) va capovolta: il piano finisce sul piatto.
    const d: Design = { ...toyLaptop(), joints: [], parts: [{ id: 't', name: 'T', shape: { op: 'union', children: [{ op: 'box', size: [4, 4, 10], at: [8, 8, 0] }, { op: 'box', size: [20, 20, 3], at: [0, 0, 10] }] } }] };
    const mesh = evaluateDesign(await manifold(), d).parts[0].mesh;
    const out = arrangePieces([{ name: 'T', mesh }], { mode: 'flat' }).pieces[0].mesh;
    expect(overhangArea(mesh)).toBeGreaterThan(300);
    expect(overhangArea(out)).toBeLessThan(1);
    const empty = { positions: new Float32Array(), indices: new Uint32Array() };
    expect(arrangePieces([{ name: 'vuoto', mesh: empty }], { mode: 'flat' }).pieces).toHaveLength(0);
  });
  it('la cerniera ha il perno anche dentro la nocca centrale', async () => {
    const w = await manifold();
    const d = toyLaptop();
    const tol = tolerancesByPart(d, setup);
    const r = evaluateDesign(w, d, {}, tol);
    const j = d.joints[0];
    const L = j.length!, R = j.radius!, g = tol[j.partA].hingeGap;
    const seg = (L - 2 * g) / 3;
    const lo = j.origin[0] - L / 2 + seg + g;
    const hi = lo + seg;
    // Superficie della parte A vicino all'asse nel tratto della nocca B: c'è solo se il perno la attraversa.
    const { positions: pos, indices: idx } = r.parts.find((p) => p.id === j.partA)!.mesh;
    let found = false;
    for (let t = 0; t < idx.length && !found; t += 3) {
      const c3 = [0, 1, 2].map((k) => (pos[idx[t] * 3 + k] + pos[idx[t + 1] * 3 + k] + pos[idx[t + 2] * 3 + k]) / 3);
      found = c3[0] > lo && c3[0] < hi && Math.hypot(c3[1] - j.origin[1], c3[2] - j.origin[2]) < R * 0.6;
    }
    expect(found).toBe(true);
  });
  it('cerniera: campione ritagliato e stampato montato', async () => {
    const w = await manifold();
    const d = toyLaptop();
    const s = planSamples(d, setup, await boxesOf(d));
    expect(s.map((x) => x.id)).toEqual(['hinge:cerniera']);
    for (const c of seriesCoupons(s[0])) {
      const r = evaluateDesign(w, c.design, {}, c.tol);
      expect(r.errors).toEqual([]);
      expect(r.parts.every((p) => p.volume > 0)).toBe(true);
      expect(c.arrange.mode).toBe('asis');
    }
  });
  it('un piatto per materiale, più piatti se non entrano', () => {
    const d = toyLaptop();
    d.printPlan = { strategy: 'separate', connection: 'snap' };
    const groups = planSamples(d, setup)
      .filter((s) => s.kind === 'snap')
      .map((s) => ({ material: s.material, filament: s.filament, coupons: seriesCoupons(s) }));
    expect(groups.map((g) => g.material)).toEqual(['PETG', 'PLA']);
    const big = layoutPlates(groups, [256, 256, 256]);
    expect(big.map((p) => p.material)).toEqual(['PETG', 'PLA']);
    const small = layoutPlates(groups, [60, 60, 60]);
    expect(small.filter((p) => p.material === 'PLA').length).toBeGreaterThan(1);
    for (const p of small) for (const it of p.items) expect(it.offset[1] + it.coupon.size[1]).toBeLessThanOrEqual(60);
  });
  it('Bambu Studio e derivati: un solo 3MF con un piatto per materiale', async () => {
    const d = toyLaptop();
    d.printPlan = { strategy: 'separate', connection: 'snap' };
    const files = await buildCalibrationFiles(d, setup, printer('bambu-a1'), evalFn);
    expect(files.filename).toBe('campioni-di-prova.3mf');
    expect(files.plates).toBe(2);
    const cfg = strFromU8(unzipSync(files.data)['Metadata/model_settings.config']);
    expect(cfg.match(/<plate>/g)).toHaveLength(2);
    expect(cfg).toMatch(/Cerniera/);
    // Ogni oggetto porta il nome del suo campione: gli avvisi dello slicer dicono quale.
    const names = [...cfg.matchAll(/<object id="\d+">\s*<metadata key="name" value="([^"]*)"/g)].map((m) => m[1]);
    expect(names.length).toBeGreaterThan(1);
    expect(names).not.toContain('Campioni di prova');
  }, 60_000);
  it('supporti attivi solo sui ritagli del modello che ne hanno bisogno', async () => {
    const d = consolle();
    // Una mensola sporgente sul supporto s1, dentro la zona dell'aggancio con la base.
    d.parts[1].shape = { op: 'union', children: [d.parts[1].shape, { op: 'box', size: [30, 4, 3], at: [5, 10, 30] }] };
    const files = await buildCalibrationFiles(d, setup, printer('bambu-a1'), evalFn, await boxesOf(d));
    const cfg = strFromU8(unzipSync(files.data)['Metadata/model_settings.config']);
    const objects = cfg.split('<object id=').slice(1);
    const withSupports = objects.filter((o) => o.includes('key="enable_support" value="1"')).map((o) => o.match(/key="name" value="([^"]*)"/)![1]);
    expect(withSupports).toEqual([expect.stringMatching(/Aggancio/)]);
  }, 120_000);
  it('le briciole del ritaglio non si stampano', () => {
    const cube = (s: number, x: number): RawMesh => {
      const v = [0, 1].flatMap((k) => [0, 1].flatMap((j) => [0, 1].flatMap((i) => [x + i * s, j * s, k * s])));
      const f = [0, 2, 1, 1, 2, 3, 4, 5, 6, 5, 7, 6, 0, 1, 4, 1, 5, 4, 2, 6, 3, 3, 6, 7, 0, 4, 2, 2, 4, 6, 1, 3, 5, 3, 7, 5];
      return { positions: new Float32Array(v), indices: new Uint32Array(f) };
    };
    const merged = (a: RawMesh, b: RawMesh): RawMesh => ({ positions: new Float32Array([...a.positions, ...b.positions]), indices: new Uint32Array([...a.indices, ...[...b.indices].map((i) => i + a.positions.length / 3)]) });
    // Briciola accanto al pezzo: sparisce (il campione resta largo 10 mm).
    const out = arrangePieces([{ name: 'P', mesh: merged(cube(10, 0), cube(1.2, 20)) }], { mode: 'flat' });
    expect(out.pieces).toHaveLength(1);
    expect(out.size[0]).toBeCloseTo(10);
    // Un guscio piccolo dentro il pezzo è una cavità: resta.
    const hollow = merged(cube(10, 0), cube(1.2, 4));
    expect(arrangePieces([{ name: 'P', mesh: hollow }], { mode: 'flat' }).pieces[0].mesh.indices.length).toBe(hollow.indices.length);
  });
  it('PrusaSlicer: uno zip con un 3MF per materiale e le istruzioni', async () => {
    const d = toyLaptop();
    d.printPlan = { strategy: 'separate', connection: 'snap' };
    const files = await buildCalibrationFiles(d, setup, printer('prusa-mk4s'), evalFn);
    expect(files.materials.sort()).toEqual(['PETG', 'PLA']);
    expect(files.filename).toBe('campioni-di-prova.zip');
    const zip = unzipSync(files.data);
    expect(Object.keys(zip).sort()).toEqual(['LEGGIMI.txt', 'campioni-petg.3mf', 'campioni-pla.3mf']);
    expect(strFromU8(zip['LEGGIMI.txt'])).toMatch(/●●●/);
    const inner = unzipSync(zip['campioni-pla.3mf']);
    expect(strFromU8(inner['3D/3dmodel.model'])).toMatch(/Cerniera/);
  }, 60_000);
  it('un solo materiale → un solo 3MF', async () => {
    const d = toyLaptop();
    d.parts.forEach((p) => (p.filamentId = 'f1'));
    const files = await buildCalibrationFiles(d, setup, printer('prusa-mk4s'), evalFn);
    expect(files.filename).toBe('campioni-pla.3mf');
    expect(materialsToTest(d, setup).map((m) => m.material)).toEqual(['PLA']);
  });
  it('le prove dichiarate si validano', () => {
    const d = consolle();
    const ok = applyOps(d, [{ op: 'add_sample', sample: { id: 'x', name: 'Prova', regions: [{ part: 'base', min: [0, 0, 0], max: [10, 10, 10] }] } }]);
    expect(ok.samples).toHaveLength(1);
    expect(() => applyOps(d, [{ op: 'add_sample', sample: { id: 'x', name: 'Prova', regions: [{ part: 'nessuna', min: [0, 0, 0], max: [10, 10, 10] }] } }])).toThrow(/inesistente/);
    expect(() => applyOps(d, [{ op: 'add_sample', sample: { id: 'x', name: 'Prova', regions: [{ part: 'base', min: [0, 0, 0], max: [500, 10, 10] }] } }])).toThrow(/zona/);
    expect(applyOps(ok, [{ op: 'remove_part', id: 'base' }]).samples).toEqual([]);
  });
});

describe('domanda automatica e linee guida', () => {
  it('propone i campioni finché il materiale non è calibrato', async () => {
    const w = await manifold();
    const d = toyLaptop();
    const parts = evaluateDesign(w, d).parts;
    const q = analyze(d, parts, setup, printer('bambu-a1'), new Set()).questions.find((x) => x.key.startsWith('calib'));
    expect(q?.options[0].action).toBe('calibration');
    const calibrated: UserSetup = { ...setup, tolerances: { PETG: { hingeGap: 0.4, pinClearance: 0.35 }, PLA: { hingeGap: 0.35, pinClearance: 0.3 } } };
    const q2 = analyze(d, parts, calibrated, printer('bambu-a1'), new Set()).questions.find((x) => x.key.startsWith('calib'));
    expect(q2).toBeUndefined();
  });
  it('segnala materiali che non aderiscono tra loro a contatto', async () => {
    const w = await manifold();
    const d = toyLaptop(); // base PETG, tastiera PLA a contatto
    d.joints = [];
    const r = analyze(d, evaluateDesign(w, d).parts, setup, printer('bambu-a1'), new Set());
    expect(r.warnings.join(' ')).toMatch(/aderiscono male/);
    expect(bondsPoorly('PLA-Silk', 'PETG')).toBe(true);
    expect(bondsPoorly('PLA', 'PLA-Matte')).toBe(false);
  });
  it('pezzi alti e stretti su stampante a piatto mobile', async () => {
    const w = await manifold();
    const d: Design = { ...toyLaptop(), joints: [], parts: [{ id: 't', name: 'Torre', filamentId: 'f1', shape: { op: 'box', size: [15, 15, 120] } }] };
    const parts = evaluateDesign(w, d).parts;
    expect(analyze(d, parts, setup, printer('bambu-a1'), new Set()).warnings.join(' ')).toMatch(/alto e stretto/);
    expect(analyze(d, parts, setup, printer('bambu-p1s'), new Set()).warnings.join(' ')).not.toMatch(/alto e stretto/);
  });
  it('pareti minime e istruzioni all’AI', () => {
    expect(minWall(0.4, false)).toBe(1.4);
    expect(minWall(0.4, true)).toBe(2.4);
    const block = printerBlock(setup, printer('bambu-a1'));
    expect(block).toMatch(/Linee guida/);
    expect(block).toMatch(/PETG: sbalzi max/);
    expect(block).toMatch(/piatto mobile/);
  });
});
