import { describe, expect, it } from 'vitest';
import { unzipSync, strFromU8 } from 'fflate';
import { bodyStats, evaluateDesign, overhangBeyond } from '../src/core/geometry/evaluate';
import { analyze } from '../src/core/analysis';
import { build3MF } from '../src/core/export/threemf';
import { supportInterfaceFor } from '../src/data/guidelines';
import type { Design, Part, UserSetup } from '../src/core/types';
import { manifold, printer, setup, toyLaptop } from './fixtures';

const plaPetg: UserSetup = {
  ...setup,
  hasMulti: true,
  filaments: [
    { id: 'f1', material: 'PLA', colorName: 'Bianco', hex: '#ffffff' },
    { id: 'f2', material: 'PETG', colorName: 'Nero', hex: '#111111' },
  ],
};

const design = (parts: Part[], strategy: Design['printPlan']['strategy'] = 'single'): Design => ({
  version: 1, name: 'x', intendedUse: { children: false }, joints: [], parts, printPlan: { strategy, connection: 'none' },
});

/** Una "T": colonna con un braccio sottile a sbalzo. */
const tee: Part = {
  id: 't', name: 'Gruccia', filamentId: 'f1',
  shape: { op: 'union', children: [{ op: 'box', size: [10, 10, 40] }, { op: 'box', size: [40, 4, 3], at: [10, 3, 37] }] },
};

async function run(d: Design, s: UserSetup = plaPetg) {
  const w = await manifold();
  const r = evaluateDesign(w, d);
  return { r, rep: analyze(d, r.parts, s, printer('bambu-a1'), new Set(), r) };
}

describe('supporti e adesione al piatto', () => {
  it('misura appoggio e sporgenze', async () => {
    const { r } = await run(design([tee]));
    const s = r.printStats.parts.t;
    expect(s.contactArea).toBeCloseTo(100, 0);
    expect(overhangBeyond(s, 50)).toBeCloseTo(160, 0); // fondo del braccio: 40×4 mm
    const cube = r.printStats.together[0];
    expect(cube.partIds).toEqual(['t']);
    expect(bodyStats(r.parts[0].mesh, 0).floating).toBe(false);
  });

  it('i ponti corti non chiedono supporti: cielo di un foro, arco tra due pilastri', async () => {
    const w = await manifold();
    const stats = (shape: Part['shape']) => evaluateDesign(w, design([{ id: 'p', name: 'P', filamentId: 'f1', shape }])).printStats.parts.p;
    const hole = stats({ op: 'difference', children: [{ op: 'box', size: [20, 20, 14] }, { op: 'cylinder', h: 10, r: 4, at: [10, 10, -1] }] });
    expect(hole.bridges).toHaveLength(1);
    expect(hole.bridges![0].span).toBeCloseTo(8, 0);
    expect(overhangBeyond(hole, 50)).toBeGreaterThan(40);
    expect(overhangBeyond(hole, 50, 50)).toBeCloseTo(0, 0);
    const arch = (gap: number) => stats({ op: 'union', children: [{ op: 'box', size: [6, 10, 10] }, { op: 'box', size: [6, 10, 10], at: [6 + gap, 0, 0] }, { op: 'box', size: [12 + gap, 10, 3], at: [0, 0, 10] }] });
    expect(overhangBeyond(arch(30), 50, 50)).toBeCloseTo(0, 0);
    expect(overhangBeyond(arch(70), 50, 50)).toBeCloseTo(700, 0); // luce oltre il limite del PLA
    // La mensola della T poggia da un lato solo: resta una sporgenza.
    const { r } = await run(design([tee]));
    expect(overhangBeyond(r.printStats.parts.t, 50, 50)).toBeCloseTo(160, 0);
  });

  it('attiva i supporti con l’interfaccia nel materiale opposto (PLA ↔ PETG)', async () => {
    const { rep } = await run(design([tee]));
    expect(rep.printHints.t.supports).toBe(true);
    expect(rep.printHints.t.interfaceFilamentId).toBe("f2");
    expect(rep.tips.join(' ')).toMatch(/PETG come interfaccia/);
    expect(supportInterfaceFor('PETG', ['PLA-Silk', 'PETG'], true)).toBe('PLA-Silk');
    // Ugello singolo: niente PLA sotto il PETG (il PETG diventerebbe fragile)
    expect(supportInterfaceFor('PETG', ['PLA', 'PETG'])).toBeUndefined();
    expect(supportInterfaceFor('ABS', ['PLA', 'PETG'])).toBeUndefined();
  });

  it('senza multicolore suggerisce soltanto il materiale opposto', async () => {
    const { rep } = await run(design([tee]), { ...plaPetg, hasMulti: false });
    expect(rep.printHints.t.interfaceFilamentId).toBeUndefined();
    expect(rep.tips.join(' ')).toMatch(/con un sistema multicolore/);
  });

  it('fissa con il brim i pezzi piccoli o snelli', async () => {
    const pin: Part = { id: 'p', name: 'Perno', filamentId: 'f1', shape: { op: 'cylinder', h: 30, r: 2 } };
    const { rep } = await run(design([pin]));
    expect(rep.printHints.p.brim).toBeGreaterThan(0);
    expect(rep.warnings.join(' ')).toMatch(/può staccarsi/);
  });

  it('segnala i pezzi che nella stampa unica non poggiano sul piatto', async () => {
    const floating: Part = { id: 'f', name: 'Mensola', filamentId: 'f1', shape: { op: 'box', size: [20, 20, 3], at: [40, 0, 15] } };
    const base: Part = { id: 'b', name: 'Base', filamentId: 'f1', shape: { op: 'box', size: [20, 20, 5] } };
    const { rep } = await run(design([base, floating]));
    expect(rep.printHints.f.supports).toBe(true);
    expect(rep.warnings.join(' ')).toMatch(/non poggia sul piatto/);
    // Stampate separate, ognuna appoggia sul piatto
    const sep = await run(design([base, floating], 'separate'));
    expect(sep.rep.printHints.f.supports).toBe(false);
  });

  it('scrive supporti, brim e interfaccia nel file per lo slicer', () => {
    const mesh = { positions: new Float32Array([0, 0, 0, 10, 0, 0, 0, 10, 0, 0, 0, 10]), indices: new Uint32Array([0, 2, 1, 0, 1, 3, 1, 2, 3, 0, 3, 2]) };
    const parts = [{ name: 'A', mesh, extruder: 1, print: { supports: true, brim: 5, interfaceExtruder: 2 } }];
    const orca = strFromU8(unzipSync(build3MF(parts, { title: 'T', flavor: 'orca', strategy: 'separate', bed: [256, 256, 256] }))['Metadata/model_settings.config']);
    expect(orca).toContain('key="enable_support" value="1"');
    expect(orca).toContain('key="support_interface_filament" value="2"');
    expect(orca).toContain('key="brim_width" value="5"');
    const prusa = strFromU8(unzipSync(build3MF(parts, { title: 'T', flavor: 'prusa', strategy: 'single', bed: [250, 210, 220] }))['Metadata/Slic3r_PE_model.config']);
    expect(prusa).toContain('key="support_material" value="1"');
    expect(prusa).toContain('key="support_material_interface_extruder" value="2"');
  });
});

describe('supporti per pezzi in PETG', () => {
  it('con un solo ugello non usa il PLA e spiega perché', async () => {
    const w = await manifold();
    const petgTee = { ...tee, filamentId: 'f2' };
    const d = design([petgTee]);
    const r = evaluateDesign(w, d);
    const rep = analyze(d, r.parts, plaPetg, printer('bambu-a1'), new Set(), r);
    expect(rep.printHints.t.interfaceFilamentId).toBeUndefined();
    expect(rep.tips.join(' ')).toMatch(/non uso il PLA/);
    const dual = analyze(d, r.parts, plaPetg, printer('bambu-h2d'), new Set(), r);
    expect(dual.printHints.t.interfaceFilamentId).toBe('f1');
  });

  it('con le parti separate non mescola i pezzi staccati con il gruppo della cerniera', async () => {
    const d = toyLaptop();
    d.printPlan.strategy = 'separate';
    const w = await manifold();
    const r = evaluateDesign(w, d);
    const rep = analyze(d, r.parts, setup, printer('bambu-a1'), new Set(), r);
    // I tasti si stampano da soli: niente orecchie della base (che è grande e piatta)
    expect(rep.printHints.keys.ears).toBeUndefined();
    expect(rep.printHints.base.ears).toBe(true);
    // Lo schermo, stampato montato sulla cerniera, è sospeso: servono i supporti
    expect(rep.printHints.screen.supports).toBe(true);
  });
});
