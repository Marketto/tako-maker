import { describe, expect, it } from 'vitest';
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { allowedLicenses, buildListing, buildPublishZip, buildTags } from '../src/core/export/publish';
import { MARKETPLACES, marketplaceFor, officialMarketplace } from '../src/data/marketplaces';
import { printers, toyLaptop } from './fixtures';

describe('Piattaforme dei produttori', () => {
  it('ogni stampante ha una piattaforma proposta, quella del marchio quando esiste', () => {
    expect(marketplaceFor('Bambu Lab').id).toBe('makerworld');
    expect(marketplaceFor('Anycubic').id).toBe('makeronline');
    expect(marketplaceFor('Prusa Research').id).toBe('printables');
    expect(marketplaceFor('Creality').id).toBe('creality-cloud');
    expect(marketplaceFor('Elegoo').id).toBe('nexprint');
    expect(officialMarketplace('QIDI')).toBeUndefined();
    expect(marketplaceFor('QIDI').id).toBe('printables');
    for (const p of printers) expect(marketplaceFor(p.brand)).toBeTruthy();
  });

  it('i marchi delle piattaforme esistono tra le stampanti', () => {
    const brands = new Set(printers.map((p) => p.brand));
    for (const m of MARKETPLACES) for (const b of m.brands) expect(brands.has(b)).toBe(true);
  });
});

describe('Licenze per la pubblicazione', () => {
  const remix = (license: string) => ({ kind: 'remix' as const, title: 'X', url: 'https://example.com', license });

  it('modello originale o ispirato: tutte le licenze', () => {
    expect(allowedLicenses()).toContain('CC0 1.0');
    expect(allowedLicenses({ ...remix('?'), kind: 'inspiration' })).toHaveLength(5);
  });

  it('remix: rispetta la licenza dell’originale', () => {
    expect(allowedLicenses(remix('CC BY-NC-SA 4.0'))).toEqual(['CC BY-NC-SA 4.0']);
    expect(allowedLicenses(remix('CC BY-SA'))).toEqual(['CC BY-SA 4.0']);
    expect(allowedLicenses(remix('Creative Commons - Attribution - Non-Commercial'))).toEqual(['CC BY-NC 4.0', 'CC BY-NC-SA 4.0']);
    expect(allowedLicenses(remix('CC BY 4.0'))).not.toContain('CC0 1.0');
    expect(allowedLicenses(remix('CC BY-ND 4.0'))).toBeNull();
    expect(allowedLicenses(remix('da verificare'))).toBeNull();
  });
});

describe('Scheda e pacchetto', () => {
  const printer = { brand: 'Anycubic', model: 'Kobra X', slicer: 'Anycubic Slicer Next' };
  const notes = [{ material: 'PLA', nozzleC: [200, 220] as [number, number], bedC: [60, 60] as [number, number] }];

  it('descrizione con stampante, materiali, supporti e licenza', () => {
    const l = buildListing({ design: toyLaptop(), printer, materialNotes: notes, supports: true, license: 'CC BY 4.0' });
    expect(l.title).toBe('Portatile giocattolo');
    expect(l.description).toContain('Anycubic Kobra X (Anycubic Slicer Next)');
    expect(l.description).toContain('PLA: ugello 200–220 °C, piatto 60 °C');
    expect(l.description).toContain('Servono supporti');
    expect(l.description).toContain('Licenza: CC BY 4.0');
  });

  it('tag senza doppioni e al massimo 10', () => {
    const tags = buildTags(toyLaptop(), ['PLA', 'PETG', 'PLA']);
    expect(tags).toContain('portatile');
    expect(tags).toContain('pla');
    expect(tags).toContain('multicolore');
    expect(new Set(tags).size).toBe(tags.length);
    expect(tags.length).toBeLessThanOrEqual(10);
  });

  it('lo zip contiene 3MF, STL, copertina e scheda', () => {
    const listing = buildListing({ design: toyLaptop(), printer, materialNotes: notes, supports: false, license: 'CC0 1.0' });
    const zip = unzipSync(buildPublishZip({
      base: 'portatile',
      model3mf: strToU8('3mf'),
      stlZip: zipSync({ 'Base.stl': strToU8('stl') }),
      cover: new Uint8Array([137, 80, 78, 71]),
      listing,
    }));
    expect(Object.keys(zip).sort()).toEqual(['portatile.3mf', 'portatile.png', 'portatile.txt', 'stl/Base.stl']);
    expect(strFromU8(zip['portatile.txt'])).toContain('Non servono supporti.');
  });
});
