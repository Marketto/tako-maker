import { describe, expect, it } from 'vitest';
import { unzipSync, strFromU8 } from 'fflate';
import { build3MF, compactExtruders, platedLayout, slicerProfileFor, type ExportPart } from '../src/core/export/threemf';
import { plateColumns, plateOrigin } from '../src/core/export/bambu3mf';
import { printer } from './fixtures';

/** Cubo di lato s con l'angolo in (x, y, 0). */
function cube(s: number, x = 0, y = 0) {
  const v = [0, 0, 0, s, 0, 0, s, s, 0, 0, s, 0, 0, 0, s, s, 0, s, s, s, s, 0, s, s];
  return {
    positions: new Float32Array(v.map((c, i) => c + (i % 3 === 0 ? x : i % 3 === 1 ? y : 0))),
    indices: new Uint32Array([0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7, 0, 1, 5, 0, 5, 4, 1, 2, 6, 1, 6, 5, 2, 3, 7, 2, 7, 6, 3, 0, 4, 3, 4, 7]),
  };
}

const kobraX = printer('anycubic-kobra-x');

describe('3MF per Bambu Studio e derivati (Anycubic Slicer Next)', () => {
  it('griglia dei piatti come Bambu Studio', () => {
    expect([1, 2, 3, 4, 5, 9, 10].map(plateColumns)).toEqual([1, 2, 2, 2, 3, 3, 4]);
    // Valori del progetto reale di Anycubic Slicer Next per Kobra X (4 piatti)
    expect(plateOrigin(1, 4, kobraX.bed, kobraX.plateStride)).toEqual([314.4, -0]);
    expect(plateOrigin(2, 4, kobraX.bed, kobraX.plateStride)).toEqual([0, -328.8]);
  });

  it('riproduce il progetto di riferimento: 4 piatti, un cubo al centro di ognuno', () => {
    const parts: ExportPart[] = [1, 2, 3, 4].map((n) => ({ name: 'Cubo', mesh: cube(26, 117, 117), extruder: 1, group: `c${n}`, plate: n }));
    const zip = unzipSync(build3MF(parts, { title: 'Cubi', flavor: 'orca', strategy: 'separate', bed: kobraX.bed, keepPositions: true, plateStride: kobraX.plateStride }));
    const model = strFromU8(zip['3D/3dmodel.model']);
    expect(model).toContain('<metadata name="Application">BambuStudio-2.0.0.3</metadata>');
    expect(model).toContain('requiredextensions="p"');
    const tr = [...model.matchAll(/<item objectid="\d+"[^>]*transform="1 0 0 0 1 0 0 0 1 ([-\d.]+) ([-\d.]+) ([-\d.]+)"/g)].map((m) => [Number(m[1]), Number(m[2]), Number(m[3])]);
    // stessi centri del file di Anycubic Slicer Next: (130,130) (444,4,130) (130,-198,8) (444,4,-198,8)
    // come nel file di riferimento: mesh centrata sull'origine, transform = centro (z = metà altezza)
    expect(tr).toEqual([[130, 130, 13], [444.4, 130, 13], [130, -198.8, 13], [444.4, -198.8, 13]]);
    expect(strFromU8(zip['3D/Objects/oggetto_1_1.model'])).toContain('<vertex x="-13" y="-13" z="-13"/>');
    const cfg = strFromU8(zip['Metadata/model_settings.config']);
    expect(cfg.match(/<plate>/g)).toHaveLength(4);
    expect(cfg.match(/<model_instance>/g)).toHaveLength(4);
    expect(cfg).toContain('<assemble>');
    expect(Object.keys(zip).filter((k) => k.startsWith('3D/Objects/'))).toHaveLength(4);
    expect(strFromU8(zip['3D/_rels/3dmodel.model.rels']).match(/Relationship /g)).toHaveLength(4);
  });

  it('parti separate: un piatto per colore e un piatto in più quando non ci stanno', () => {
    const parts: ExportPart[] = [
      { name: 'A', mesh: cube(100), extruder: 1 },
      { name: 'B', mesh: cube(100), extruder: 2 },
      { name: 'C', mesh: cube(100), extruder: 1 },
      { name: 'D', mesh: cube(100), extruder: 1 },
      { name: 'E', mesh: cube(100), extruder: 1 },
      { name: 'F', mesh: cube(100), extruder: 1 },
    ];
    const plates = platedLayout(parts, [220, 220, 220]).map((p) => p.plate);
    // colore 1: 4 cubi da 100 mm per piatto da 220 → 2 per riga, 2 righe? (100+6)*2 < 220 → 4 per piatto
    expect(plates).toEqual([1, 3, 1, 1, 1, 2]);
  });

  it('un pezzo quasi lungo quanto il piatto resta dentro (256 mm su 260)', () => {
    const long = { positions: new Float32Array([0, -22, 0, 256, 27, 55]), indices: new Uint32Array() };
    const [p] = platedLayout([{ name: 'Supporto', mesh: long, extruder: 1 }], [260, 260, 260]);
    expect(p.offset[0]).toBeCloseTo(2);
    expect(p.offset[0] + 256).toBeLessThanOrEqual(260);
  });

  it('modello montato: un oggetto con una parte per colore, sul primo piatto', () => {
    const parts: ExportPart[] = [
      { name: 'Base', mesh: cube(20), extruder: 1, print: { supports: true, brim: 0 } },
      { name: 'Tetto', mesh: cube(20, 0, 0), extruder: 2 },
    ];
    const zip = unzipSync(build3MF(parts, { title: 'Casetta', flavor: 'orca', strategy: 'multicolor', bed: [256, 256, 256] }));
    const cfg = strFromU8(zip['Metadata/model_settings.config']);
    expect(cfg.match(/<object id=/g)).toHaveLength(1);
    expect(cfg.match(/<part id=/g)).toHaveLength(2);
    expect(cfg).toContain('value="Casetta"');
    expect(cfg).toContain('key="enable_support" value="1"');
    expect(cfg.match(/<plate>/g)).toHaveLength(1);
  });

  it('con il profilo della stampante il 3MF è un progetto: impostazioni minime e filamenti usati (estrusori 8 e 9 → 1 e 2)', () => {
    const white = { id: 'w', material: 'PETG', colorName: 'Bianco', hex: '#ffffff' };
    const black = { id: 'k', material: 'PETG', colorName: 'Nero', hex: '#000000' };
    const filaments = [...Array(7).keys()].map((i) => ({ id: `f${i}`, material: 'PLA', colorName: 'X', hex: '#123456' })).concat(white, black);
    const parts: ExportPart[] = [
      { name: 'Supporto', mesh: cube(100), extruder: 8, filament: white },
      { name: 'Gancio', mesh: cube(20), extruder: 9, filament: black, print: { supports: true, brim: 0, interfaceExtruder: 8 } },
    ];
    const profile = slicerProfileFor({ printerId: kobraX.id, hasMulti: true, filaments }, kobraX)!;
    expect(profile.printer).toBe('Anycubic Kobra X 0.4 nozzle');
    const zip = unzipSync(build3MF(parts, { title: 'Nordli', flavor: 'orca', strategy: 'separate', bed: kobraX.bed, plateStride: kobraX.plateStride, slicerProfile: profile, filaments }));
    const ps = JSON.parse(strFromU8(zip['Metadata/project_settings.config']));
    expect(ps).toMatchObject({ from: 'project', printer_settings_id: 'Anycubic Kobra X 0.4 nozzle', printable_area: ['0x0', '260x0', '260x260', '0x260'] });
    expect(ps.filament_colour).toEqual(['#FFFFFF', '#000000']);
    expect(ps.filament_settings_id).toEqual(['Anycubic PETG @Anycubic Kobra X 0.4 nozzle', 'Anycubic PETG @Anycubic Kobra X 0.4 nozzle']);
    expect(strFromU8(zip['Metadata/slice_info.config'])).toContain('key="X-ACNext-Client-Type" value="slicer"');
    const cfg = strFromU8(zip['Metadata/model_settings.config']);
    expect(cfg).not.toMatch(/key="extruder" value="[89]"/);
    expect(cfg).toContain('key="support_interface_filament" value="1"');
  });

  it('senza profilo noto (o con un ugello diverso) niente impostazioni di progetto', () => {
    const setup = { printerId: kobraX.id, hasMulti: false, filaments: [], nozzle: 0.6 };
    expect(slicerProfileFor(setup, kobraX)).toBeUndefined();
    const zip = unzipSync(build3MF([{ name: 'A', mesh: cube(10), extruder: 3 }], { title: 'A', flavor: 'orca', strategy: 'separate', bed: kobraX.bed }));
    expect(zip['Metadata/project_settings.config']).toBeUndefined();
    expect(strFromU8(zip['Metadata/model_settings.config'])).toContain('key="extruder" value="3"');
    expect(compactExtruders([{ name: 'A', mesh: cube(10), extruder: 3 }]).parts[0].extruder).toBe(1);
  });
});
