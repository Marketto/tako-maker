import type { Design, PrinterSpec, UserSetup } from '../core/types';
import type { AnalysisReport } from '../core/analysis';
import type { SearchResult } from './tools';
import { bedOf } from '../core/analysis/estimate';
import systemMd from './prompts/system.md?raw';
import dslMd from './prompts/dsl.md?raw';
import type { Skill } from './skills';
import { MATERIALS } from '../data/materials';
import { guideline, minWall } from '../data/guidelines';
import { tolerancesFor } from '../core/calibration/tolerances';

/* Costruzione del contesto pensata per il prompt caching:
   [system statico] + [DSL statico] + [skill] + [stampante e filamenti]  ← in cache
   [design corrente + richiesta]                                           ← variabile */

export interface ImportedMeshInfo {
  id: string;
  name: string;
  size: [number, number, number];
  manifold: boolean;
}

export function printerBlock(setup: UserSetup, printer: PrinterSpec): string {
  const bed = bedOf(setup, printer);
  const multi = printer.multi
    ? `${printer.multi.system} da ${printer.multi.slots} slot: ${setup.hasMulti ? 'posseduto' : 'NON posseduto'}`
    : 'nessun sistema multicolore';
  const fil = setup.filaments.map((f) => `${f.id}=${f.material} ${f.colorName}`).join(', ') || 'nessuno';
  const used = new Set(setup.filaments.map((f) => f.material));
  const notes = MATERIALS.filter((m) => used.has(m.id)).map((m) => `${m.label}: ${m.notes}`).join(' ');
  const nozzle = setup.nozzle ?? printer.nozzle ?? 0.4;
  const kin = printer.kinematics === 'bedslinger' ? 'piatto mobile (evita pezzi alti e stretti in piedi)' : 'CoreXY';
  const rules = [...used]
    .map((m) => {
      const g = guideline(m);
      const t = tolerancesFor(m, setup);
      const cal = setup.tolerances?.[m] ? ' (calibrate)' : '';
      return `- ${m}: sbalzi max ${g.overhangDeg}°, ponti max ${g.bridgeMm} mm, ${g.goodForSnap ? 'adatto' : 'poco adatto'} a scatti/incastri, giochi${cal} cerniera ${t.hingeGap} mm, incastro ${t.pegSnap} mm, colla ${t.pegGlue} mm${g.warps ? ', tende a deformarsi: basi ampie e niente angoli vivi grandi' : ''}`;
    })
    .join('\n');
  return `## Stampante e materiali dell'utente\nStampante: ${printer.brand} ${printer.model}, volume ${bed.join('×')} mm, ${printer.enclosed ? 'camera chiusa' : 'aperta'}, ${kin}, ugello ${nozzle} mm, ${multi}. Slicer: ${printer.slicer}.\nFilamenti disponibili (id=materiale colore): ${fil}.\n${notes}\n## Linee guida da rispettare\n- Pareti e dettagli: almeno ${minWall(nozzle, false)} mm (${minWall(nozzle, true)} mm per oggetti da bambini).\n- I giochi di cerniere e perni li applica l'app con i valori sotto: non aggiungerli tu nella geometria.\n${rules}\n- PLA e PETG (e PLA con ABS/ASA) aderiscono male tra loro: non metterli a contatto nella stessa stampa.\n- Cerniere stampate già montate: asse parallelo al piatto (x o y).`;
}

export function systemBlocks(skill: Skill, setup: UserSetup, printer: PrinterSpec) {
  const needsDsl = skill.tools.includes('edit_design');
  const blocks = [
    { type: 'text' as const, text: systemMd + (needsDsl ? '\n' + dslMd : '') },
    { type: 'text' as const, text: `## Skill attiva: ${skill.name}\n${skill.instructions}` },
    { type: 'text' as const, text: printerBlock(setup, printer), cache_control: { type: 'ephemeral' as const } },
  ];
  return blocks;
}

/** Design senza campi vuoti, numeri arrotondati: meno token. */
export function compactDesign(d: Design): string {
  return JSON.stringify(d, (_k, v) => {
    if (typeof v === 'number') return Math.round(v * 100) / 100;
    if (v === undefined || v === null) return undefined;
    return v;
  });
}

export function userContext(opts: {
  design: Design;
  report?: AnalysisReport;
  meshes: ImportedMeshInfo[];
  reference?: SearchResult;
}): string {
  const parts: string[] = [];
  if (opts.reference) {
    const r = opts.reference;
    parts.push(`Riferimento scelto dall'utente (solo ispirazione): "${r.title}" — ${r.summary} (${r.site}, licenza ${r.license}).`);
  }
  if (opts.meshes.length) {
    parts.push(
      'Mesh importate: ' +
        opts.meshes.map((m) => `ref="${m.id}" "${m.name}" ${m.size.map((v) => v.toFixed(0)).join('×')} mm, ${m.manifold ? 'chiusa' : 'NON chiusa (niente booleane)'}`).join('; '),
    );
  }
  if (opts.design.parts.length) {
    parts.push(`Design attuale: ${compactDesign(opts.design)}`);
    if (opts.report?.summary) parts.push(`Analisi attuale: ${opts.report.summary}`);
  } else {
    parts.push('Il design è ancora vuoto.');
  }
  return `<contesto>\n${parts.join('\n')}\n</contesto>`;
}
