import { strToU8, unzipSync, zipSync } from 'fflate';
import type { Design } from '../types';
import type { StrategyEstimate } from '../analysis/estimate';
import { fmtTime } from '../analysis/estimate';
import { hardwareLabel, toBuy } from '../hardware';
import { attributionText } from './threemf';
import { t } from '../../i18n';

/* Pubblicazione sulle piattaforme dei produttori: scheda (titolo, descrizione, tag, licenza)
   calcolata dal progetto senza AI e pacchetto zip con tutto quello da caricare. */

/** Licenze che non permettono opere derivate (niente remix né pubblicazione). */
export const LICENSE_NO_DERIVATIVES = /\bND\b|no[\s-]?deriv|non opere derivate|standard digital file/i;

export const LICENSES = ['CC BY 4.0', 'CC BY-SA 4.0', 'CC BY-NC 4.0', 'CC BY-NC-SA 4.0', 'CC0 1.0'] as const;
export type License = (typeof LICENSES)[number];

/** Licenze ammesse: per un remix dipendono dall'originale. `null` = non si può pubblicare. */
export function allowedLicenses(source?: Design['source']): License[] | null {
  if (!source || source.kind === 'inspiration') return [...LICENSES];
  const l = source.license;
  if (LICENSE_NO_DERIVATIVES.test(l)) return null;
  if (/CC0|public domain|pubblico dominio/i.test(l)) return [...LICENSES];
  const nc = /\bNC\b|non[\s-]?commercial/i.test(l);
  const sa = /\bSA\b|share[\s-]?alike/i.test(l);
  if (nc && sa) return ['CC BY-NC-SA 4.0'];
  if (sa) return ['CC BY-SA 4.0'];
  if (nc) return ['CC BY-NC 4.0', 'CC BY-NC-SA 4.0'];
  if (/\bCC\b|creative commons|\bBY\b/i.test(l)) return LICENSES.filter((x) => x !== 'CC0 1.0');
  return null; // licenza sconosciuta o da verificare
}

export interface ListingInput {
  design: Design;
  printer: { brand: string; model: string; slicer: string };
  estimate?: StrategyEstimate;
  materialNotes: { material: string; nozzleC: [number, number]; bedC: [number, number] }[];
  supports: boolean;
  license: License;
}

export interface Listing {
  title: string;
  description: string;
  tags: string[];
  license: License;
}

const range = ([a, b]: [number, number]) => (a === b ? `${a}` : `${a}–${b}`);

export function buildListing({ design: d, printer, estimate, materialNotes, supports, license }: ListingInput): Listing {
  const lines: string[] = [];
  lines.push(d.description?.trim() || d.name, '');
  lines.push(t('Stampa'));
  lines.push('- ' + t('Stampante usata: {printer} ({slicer})', { printer: `${printer.brand} ${printer.model}`, slicer: printer.slicer }));
  if (materialNotes.length) {
    lines.push('- ' + t('Materiali: {list}', { list: materialNotes.map((m) => m.material).join(', ') }));
    for (const m of materialNotes) lines.push(`  ${m.material}: ` + t('ugello {nozzle} °C, piatto {bed} °C', { nozzle: range(m.nozzleC), bed: range(m.bedC) }));
  }
  lines.push('- ' + (d.parts.length === 1 ? t('1 parte') : t('{n} parti', { n: d.parts.length })));
  if (estimate?.feasible) lines.push('- ' + t('Tempo stimato: {time}, filamento: {grams} g', { time: fmtTime(estimate.timeS), grams: Math.round(estimate.filamentG) }));
  lines.push('- ' + (supports ? t('Servono supporti: sono già impostati nel file 3MF.') : t('Non servono supporti.')));
  if (estimate?.needsAssembly) lines.push('- ' + t('Le parti si montano dopo la stampa.'));
  const buy = toBuy(d);
  if (buy.length) {
    lines.push('', t('Da acquistare a parte'));
    for (const h of buy) lines.push(`- ${hardwareLabel(h)}${h.purpose ? ` — ${h.purpose}` : ''}`);
  }
  if (d.source?.kind === 'remix') lines.push('', attributionText(d.source).trim());
  lines.push('', t('Licenza: {license}', { license }), t('Progettato con Printopus: {url}', { url: 'https://marketto.github.io/printopus/' }));
  return { title: d.name, description: lines.join('\n'), tags: buildTags(d, materialNotes.map((m) => m.material)), license };
}

/** Tag: parole del nome, materiali, «multicolore» se servono più filamenti. */
export function buildTags(d: Design, materials: string[]): string[] {
  const words = d.name.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((w) => w.length >= 4);
  const multi = new Set(d.parts.map((p) => p.filamentId).filter(Boolean)).size > 1;
  const tags = [...words, ...materials.map((m) => m.toLowerCase()), ...(multi ? [t('multicolore').toLowerCase()] : []), 'printopus'];
  return [...new Set(tags)].slice(0, 10);
}

export function listingText(l: Listing): string {
  return [l.title, '', l.description, '', t('Tag: {list}', { list: l.tags.join(', ') }), ''].join('\n');
}

/** Zip da caricare: 3MF con le impostazioni, STL per parte, copertina e scheda di testo. */
export function buildPublishZip(o: { base: string; model3mf: Uint8Array; stlZip: Uint8Array; cover?: Uint8Array; listing: Listing }): Uint8Array {
  const files: Record<string, Uint8Array> = { [`${o.base}.3mf`]: o.model3mf, [`${o.base}.txt`]: strToU8(listingText(o.listing)) };
  for (const [name, data] of Object.entries(unzipSync(o.stlZip))) files[`stl/${name}`] = data;
  if (o.cover) files[`${o.base}.png`] = o.cover;
  return zipSync(files);
}
