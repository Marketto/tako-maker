import { describe, expect, it } from 'vitest';
import { strFromU8, unzipSync } from 'fflate';
import { evaluateDesign } from '../src/core/geometry/evaluate';
import { analyze } from '../src/core/analysis';
import { buildCoupons, layoutPlates, materialsToTest, neededTests, testValues } from '../src/core/calibration/coupons';
import { buildCalibrationFiles } from '../src/core/calibration/export';
import { tolerancesByPart, tolerancesFor } from '../src/core/calibration/tolerances';
import { bondsPoorly, minWall } from '../src/data/guidelines';
import { printerBlock } from '../src/agent/context';
import type { Design, UserSetup } from '../src/core/types';
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

describe('campioni di prova', () => {
  it('servono per cerniere, scatti e incastri', () => {
    const d = toyLaptop();
    expect(neededTests(d)).toEqual(['hinge']);
    d.joints[0].detent = { enabled: true };
    d.printPlan = { strategy: 'separate', connection: 'snap' };
    expect(neededTests(d)).toEqual(['hinge', 'detent', 'snap']);
  });
  it('5 valori centrati sul consigliato del materiale', () => {
    const v = testValues('hinge', 'PLA');
    expect(v).toHaveLength(5);
    expect(v[2]).toBe(tolerancesFor('PLA').hingeGap);
  });
  it('ogni campione si costruisce senza errori', async () => {
    const w = await manifold();
    const f = setup.filaments[0];
    for (const kind of ['hinge', 'detent', 'snap', 'glue'] as const) {
      for (const c of buildCoupons(kind, f.material, f, setup)) {
        const r = evaluateDesign(w, c.design, {}, { a: c.tol, b: c.tol });
        expect(r.errors).toEqual([]);
        expect(r.parts).toHaveLength(2);
      }
    }
  });
  it('un piatto per materiale, più piatti se non entrano', () => {
    const [pla, , petg] = setup.filaments;
    const groups = [
      { material: 'PLA', filament: pla, coupons: ['hinge', 'snap'].flatMap((k) => buildCoupons(k as 'hinge', 'PLA', pla, setup)) },
      { material: 'PETG', filament: petg, coupons: buildCoupons('hinge', 'PETG', petg, setup) },
    ];
    const big = layoutPlates(groups, [256, 256, 256]);
    expect(big.map((p) => p.material)).toEqual(['PLA', 'PETG']);
    const small = layoutPlates(groups, [90, 90, 90]);
    expect(small.filter((p) => p.material === 'PLA').length).toBeGreaterThan(1);
    for (const p of small) for (const it of p.items) expect(it.offset[1] + it.coupon.size[1]).toBeLessThanOrEqual(90);
  });
  it('produce uno zip con un 3MF per materiale e le istruzioni', async () => {
    const d = toyLaptop();
    d.parts[2].filamentId = 'f1'; // schermo in PLA, base in PETG → due materiali
    const files = await buildCalibrationFiles(d, setup, printer('bambu-a1'), evalFn);
    expect(files.materials.sort()).toEqual(['PETG', 'PLA']);
    expect(files.filename).toBe('campioni-di-prova.zip');
    const zip = unzipSync(files.data);
    expect(Object.keys(zip).sort()).toEqual(['LEGGIMI.txt', 'campioni-petg.3mf', 'campioni-pla.3mf']);
    expect(strFromU8(zip['LEGGIMI.txt'])).toMatch(/●●●/);
    const inner = unzipSync(zip['campioni-pla.3mf']);
    expect(strFromU8(inner['3D/3dmodel.model'])).toMatch(/Cerniera/);
  });
  it('un solo materiale → un solo 3MF', async () => {
    const d = toyLaptop();
    d.parts.forEach((p) => (p.filamentId = 'f1'));
    const files = await buildCalibrationFiles(d, setup, printer('bambu-a1'), evalFn);
    expect(files.filename).toBe('campioni-pla.3mf');
    expect(materialsToTest(d, setup).map((m) => m.material)).toEqual(['PLA']);
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
