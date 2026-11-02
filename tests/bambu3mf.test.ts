import { describe, expect, it } from 'vitest';
import { unzipSync, strFromU8 } from 'fflate';
import { build3MF, platedLayout, type ExportPart } from '../src/core/export/threemf';
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
    const tr = [...model.matchAll(/<item objectid="\d+"[^>]*transform="1 0 0 0 1 0 0 0 1 ([-\d.]+) ([-\d.]+) ([-\d.]+)"/g)].map((m) => [Number(m[1]) + 130, Number(m[2]) + 130]);
    // stessi centri del file di Anycubic Slicer Next: (130,130) (444,4,130) (130,-198,8) (444,4,-198,8)
    expect(tr).toEqual([[130, 130], [444.4, 130], [130, -198.8], [444.4, -198.8]]);
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
});
