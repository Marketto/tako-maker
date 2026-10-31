import { strToU8, zipSync } from 'fflate';
import type { Design, PrinterSpec, Tolerances, UserSetup } from '../types';
import type { PartResult } from '../geometry/evaluate';
import { build3MF, flavorForSlicer, type ExportPart } from '../export/threemf';
import { bedOf } from '../analysis/estimate';
import { buildCoupons, layoutPlates, materialsToTest, neededTests, readmeText, type TestKind } from './coupons';

/* File dei campioni di prova: un 3MF per piatto, un materiale per piatto.
   Se i piatti sono più di uno, vengono raccolti in uno zip con le istruzioni. */

export type Evaluate = (design: Design, tolByPart: Record<string, Tolerances>) => Promise<PartResult[]>;

export interface CalibrationFiles {
  filename: string;
  data: Uint8Array;
  mime: string;
  readme: string;
  plates: number;
  materials: string[];
  kinds: TestKind[];
}

export async function buildCalibrationFiles(design: Design, setup: UserSetup, printer: PrinterSpec, evaluate: Evaluate): Promise<CalibrationFiles> {
  const kinds = neededTests(design);
  if (!kinds.length) throw new Error('Il modello non ha parti mobili né incastri da provare.');
  const mats = materialsToTest(design, setup);
  if (!mats.length) throw new Error('Nessun filamento disponibile per i campioni.');
  const bed = bedOf(setup, printer);
  const groups = mats.map(({ material, filament }) => ({ material, filament, coupons: kinds.flatMap((k) => buildCoupons(k, material, filament, setup)) }));
  const plates = layoutPlates(groups, bed);
  const readme = readmeText(plates, kinds);
  const flavor = flavorForSlicer(printer.slicer);

  const files: { name: string; data: Uint8Array }[] = [];
  for (const plate of plates) {
    const parts: ExportPart[] = [];
    const extruder = setup.filaments.indexOf(plate.filament) + 1 || 1;
    for (const { coupon, offset } of plate.items) {
      const res = await evaluate(coupon.design, { a: coupon.tol, b: coupon.tol });
      for (const r of res) {
        const pos = new Float32Array(r.mesh.positions);
        for (let i = 0; i < pos.length; i += 3) {
          pos[i] += offset[0];
          pos[i + 1] += offset[1];
          pos[i + 2] += offset[2];
        }
        parts.push({ name: r.name, mesh: { positions: pos, indices: r.mesh.indices }, filament: plate.filament, extruder, group: coupon.id });
      }
    }
    const title = `Campioni ${plate.material}${plates.filter((p) => p.material === plate.material).length > 1 ? ` – piatto ${plate.index}` : ''}`;
    const data = build3MF(parts, { title, flavor, strategy: 'separate', bed, keepPositions: true, extraFiles: { 'Metadata/LEGGIMI.txt': readme } });
    const slug = plate.material.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    files.push({ name: `campioni-${slug}${plate.index > 1 || plates.filter((p) => p.material === plate.material).length > 1 ? `-piatto${plate.index}` : ''}.3mf`, data });
  }

  const materials = mats.map((m) => m.material);
  if (files.length === 1) {
    return { filename: files[0].name, data: files[0].data, mime: 'model/3mf', readme, plates: 1, materials, kinds };
  }
  const zip: Record<string, Uint8Array> = { 'LEGGIMI.txt': strToU8(readme) };
  for (const f of files) zip[f.name] = f.data;
  return { filename: 'campioni-di-prova.zip', data: zipSync(zip), mime: 'application/zip', readme, plates: files.length, materials, kinds };
}
