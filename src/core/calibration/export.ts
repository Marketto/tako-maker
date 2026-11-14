import { strToU8, zipSync } from 'fflate';
import type { Design, PrinterSpec, Tolerances, UserSetup } from '../types';
import type { PartResult } from '../geometry/evaluate';
import { build3MF, flavorForSlicer, slicerProfileFor, type ExportPart } from '../export/threemf';
import { bedOf } from '../analysis/estimate';
import { needsSupports } from '../analysis';
import { bodyStats } from '../geometry/evaluate';
import { layoutPlates, readmeText, samplesToPrint, seriesCoupons, type PartBox, type Coupon, type SampleSeries, type TestKind } from './coupons';
import { arrangePieces, type Piece } from './arrange';
import { t } from '../../i18n';

/* File dei campioni di prova: pezzi del modello ritagliati attorno alle parti incerte
   (vedi coupons.ts), un piatto per materiale (più piatti se non ci stanno).
   - Bambu Studio e derivati (Anycubic, Orca, Creality…): un solo 3MF con tutti i piatti.
   - PrusaSlicer (senza piatti multipli): un 3MF per piatto, raccolti in uno zip con le istruzioni. */

export type Evaluate = (design: Design, tolByPart: Record<string, Tolerances>) => Promise<PartResult[]>;

export interface CalibrationFiles {
  filename: string;
  data: Uint8Array;
  mime: string;
  readme: string;
  plates: number;
  materials: string[];
  kinds: TestKind[];
  series: SampleSeries[];
}

export async function buildCalibrationFiles(design: Design, setup: UserSetup, printer: PrinterSpec, evaluate: Evaluate, boxes: Record<string, PartBox> = {}): Promise<CalibrationFiles> {
  const series = samplesToPrint(design, setup, boxes);
  if (!series.length) throw new Error(t('Il modello non ha parti mobili né incastri da provare.'));
  const bed = bedOf(setup, printer);
  const flavor = flavorForSlicer(printer.slicer);

  // Prima si calcolano e si sistemano i pezzi: l'ingombro vero serve per disporli sui piatti.
  const placed = new Map<string, Piece[]>();
  const groups = new Map<string, { material: string; filament: SampleSeries['filament']; coupons: Coupon[] }>();
  for (const s of series) {
    for (const c of seriesCoupons(s)) {
      const res = await evaluate(c.design, c.tol);
      const r = arrangePieces(res.filter((p) => !c.drop?.includes(p.id)).map((p) => ({ name: p.name, mesh: p.mesh })), c.arrange);
      if (!r.pieces.length) continue;
      c.size = r.size;
      placed.set(c.id, r.pieces);
      const g = groups.get(s.material) ?? { material: s.material, filament: s.filament, coupons: [] };
      g.coupons.push(c);
      groups.set(s.material, g);
    }
  }
  if (!groups.size) throw new Error(t('Il modello non ha parti mobili né incastri da provare.'));
  const mats = [...groups.values()];
  const plates = layoutPlates(mats, bed);
  const readme = readmeText(plates);
  const kinds = [...new Set(series.map((s) => s.kind).filter((k): k is TestKind => k !== 'fit'))];

  const files: { name: string; data: Uint8Array }[] = [];
  const all: ExportPart[] = [];
  for (const [pi, plate] of plates.entries()) {
    const parts: ExportPart[] = [];
    const extruder = setup.filaments.indexOf(plate.filament) + 1 || 1;
    for (const { coupon, offset } of plate.items) {
      const label = `${coupon.series.name}${coupon.value === undefined ? '' : ` ${'●'.repeat(coupon.index + 1)}`}`;
      for (const r of placed.get(coupon.id) ?? []) {
        const pos = new Float32Array(r.mesh.positions);
        for (let i = 0; i < pos.length; i += 3) {
          pos[i] += offset[0];
          pos[i + 1] += offset[1];
          pos[i + 2] += offset[2];
        }
        // Gli agganci e le prove dichiarate sono ritagli del modello: forme libere, con le stesse sporgenze
        // del pezzo vero, quindi supporti con la stessa regola dell'analisi. I campioni dei giunti no:
        // l'unica sporgenza è il cielo del foro, un ponte corto (i supporti lo riempirebbero).
        const supports = coupon.series.kind === 'fit' && needsSupports(bodyStats(r.mesh, 0), [plate.material]);
        parts.push({ name: `${label} – ${r.name}`, mesh: { positions: pos, indices: r.mesh.indices }, filament: plate.filament, extruder, group: coupon.id, groupName: label, plate: pi + 1, print: { supports, brim: 0 } });
      }
    }
    all.push(...parts);
    if (flavor === 'orca') continue;
    const title =
      plates.filter((p) => p.material === plate.material).length > 1
        ? t('Campioni {material} – piatto {n}', { material: plate.material, n: plate.index })
        : t('Campioni {material}', { material: plate.material });
    const data = build3MF(parts, { title, flavor, strategy: 'separate', bed, keepPositions: true, extraFiles: { 'Metadata/LEGGIMI.txt': readme } });
    const slug = plate.material.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    files.push({ name: `campioni-${slug}${plate.index > 1 || plates.filter((p) => p.material === plate.material).length > 1 ? `-piatto${plate.index}` : ''}.3mf`, data });
  }

  const materials = mats.map((m) => m.material);
  if (flavor === 'orca') {
    const data = build3MF(all, { title: t('Campioni di prova'), flavor, strategy: 'separate', bed, keepPositions: true, plateStride: printer.plateStride, slicerProfile: slicerProfileFor(setup, printer), filaments: setup.filaments, extraFiles: { 'Metadata/LEGGIMI.txt': readme } });
    return { filename: 'campioni-di-prova.3mf', data, mime: 'model/3mf', readme, plates: plates.length, materials, kinds, series };
  }
  if (files.length === 1) {
    return { filename: files[0].name, data: files[0].data, mime: 'model/3mf', readme, plates: 1, materials, kinds, series };
  }
  const zip: Record<string, Uint8Array> = { 'LEGGIMI.txt': strToU8(readme) };
  for (const f of files) zip[f.name] = f.data;
  return { filename: 'campioni-di-prova.zip', data: zipSync(zip), mime: 'application/zip', readme, plates: files.length, materials, kinds, series };
}
