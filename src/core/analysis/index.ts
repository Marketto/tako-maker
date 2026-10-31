import type { Design, PrinterSpec, Question, ShapeNode, UserSetup, Vec3 } from '../types';
import type { DesignOp } from '../design/ops';
import { walkShape } from '../design/ops';
import { findContacts } from '../geometry/evaluate';
import { material } from '../../data/materials';
import { bedOf, estimateStrategies, fitsBed, fmtTime, STRATEGY_LABEL, type PartStat, type StrategyEstimate } from './estimate';

/* Controlli deterministici eseguiti dopo OGNI modifica, senza chiamare l'AI:
   - strategia di stampa (multicolore / parti separate / cambio a quota)
   - tipo di collegamento tra parti separate (colla / incastro)
   - parti mobili → scatti
   - uso da parte di bambini → spigoli arrotondati, parti piccole
   - dimensioni rispetto al piatto, compatibilità materiali */

export interface AnalysisReport {
  estimates: StrategyEstimate[];
  recommended?: StrategyEstimate;
  questions: Question[];
  warnings: string[];
  summary: string;
}

const CHILD_RADIUS = 2;
/** Cilindro del test "small parts" (diametro 31,7 mm, profondità 57,1 mm). */
const SMALL_PART = { d: 31.7, depth: 57.1 };

function sig(design: Design): string {
  return design.parts.map((p) => `${p.id}:${p.filamentId ?? ''}`).sort().join(',');
}

/** Raggio di arrotondamento ottenibile su un box (limitato dallo spessore). */
function targetRadius(size: Vec3, radius = CHILD_RADIUS): number {
  return Math.round(Math.min(radius, Math.min(...size) / 4) * 10) / 10;
}

const isSharp = (node: { size: Vec3; radius?: number }) => {
  const t = targetRadius(node.size);
  return t >= 0.3 && (node.radius ?? 0) < t - 0.05;
};

export function sharpBoxes(shape: ShapeNode): number {
  let n = 0;
  walkShape(shape, (node, ctx) => {
    if (node.op === 'box' && !ctx.subtractive && isSharp(node)) n++;
  });
  return n;
}

/** Copia della forma con gli spigoli esterni arrotondati. */
export function roundShape(shape: ShapeNode, radius = CHILD_RADIUS, subtractive = false): ShapeNode {
  if (shape.op === 'box') {
    if (subtractive || !isSharp(shape)) return shape;
    return { ...shape, radius: targetRadius(shape.size, radius) };
  }
  if ('children' in shape) {
    return { ...shape, children: shape.children.map((c, i) => roundShape(c, radius, subtractive || (shape.op === 'difference' && i > 0))) };
  }
  return shape;
}

export function analyze(
  design: Design,
  parts: PartStat[],
  setup: UserSetup,
  printer: PrinterSpec,
  answered: Set<string>,
): AnalysisReport {
  const questions: Question[] = [];
  const warnings: string[] = [];
  const s = sig(design);
  const bed = bedOf(setup, printer);
  const filById = new Map(setup.filaments.map((f) => [f.id, f]));

  /* ---- Strategia ---- */
  const linked = design.joints.filter((j) => j.type !== 'slider').map((j) => [j.partA, j.partB] as [string, string]);
  const estimates = estimateStrategies(parts, setup, printer, linked);
  const feasible = estimates.filter((e) => e.feasible);
  const recommended = feasible[0];
  const current = design.printPlan.strategy;
  const currentEst = estimates.find((e) => e.strategy === current);

  if (recommended && recommended.strategy !== current && parts.length > 0) {
    const key = `strategy:${recommended.strategy}:${s}`;
    if (!answered.has(key)) {
      const why = currentEst && currentEst.feasible
        ? `Stima: ${fmtTime(recommended.timeS)} e ${recommended.wasteG.toFixed(0)} g di scarto, contro ${fmtTime(currentEst.timeS)} e ${currentEst.wasteG.toFixed(0)} g.`
        : currentEst?.reason
          ? `La strategia attuale non è possibile: ${currentEst.reason.toLowerCase()}.`
          : undefined;
      questions.push({
        id: key,
        key,
        source: 'analysis',
        text: `Conviene passare a: ${STRATEGY_LABEL[recommended.strategy]}?`,
        detail: why,
        options: [
          { id: 'yes', label: 'Sì, cambia', ops: [{ op: 'set_plan', strategy: recommended.strategy }] },
          { id: 'no', label: `No, resta su ${STRATEGY_LABEL[current]}` },
        ],
      });
    }
  }

  /* ---- Cerniere tra parti di colori diversi senza multicolore ---- */
  const multiOk = estimates.find((e) => e.strategy === 'multicolor')?.feasible;
  if (!multiOk) {
    const partName = (id: string) => design.parts.find((x) => x.id === id)?.name ?? id;
    const fil = (id: string) => design.parts.find((x) => x.id === id)?.filamentId;
    const label = (id: string) => {
      const f = filById.get(fil(id) ?? '');
      return f ? `${f.material} ${f.colorName}` : 'senza filamento';
    };
    for (const j of design.joints.filter((x) => x.type !== 'slider' && fil(x.partA) !== fil(x.partB))) {
      const key = `jointcolor:${j.id}:${s}`;
      if (answered.has(key)) continue;
      questions.push({
        id: key,
        key,
        source: 'analysis',
        text: `"${partName(j.partA)}" e "${partName(j.partB)}" sono unite da una cerniera stampata già montata: usiamo lo stesso colore?`,
        detail: 'Senza stampa multicolore devono uscire insieme dallo stesso piatto, quindi dello stesso filamento.',
        options: [
          { id: 'a', label: `Tutto ${label(j.partA)}`, ops: [{ op: 'update_part', id: j.partB, filamentId: fil(j.partA) }] },
          { id: 'b', label: `Tutto ${label(j.partB)}`, ops: [{ op: 'update_part', id: j.partA, filamentId: fil(j.partB) }] },
          { id: 'no', label: 'Lascia così' },
        ],
      });
    }
  }

  /* ---- Collegamento tra parti separate ---- */
  if (design.printPlan.strategy === 'separate' && design.printPlan.connection === 'none') {
    const contacts = findContacts(parts.map((p) => ({ id: p.id, box: p.contactBox ?? p.bbox })));
    const key = `connection:${s}`;
    if (contacts.length && !answered.has(key)) {
      questions.push({
        id: key,
        key,
        source: 'analysis',
        text: 'Come vuoi unire le parti?',
        detail: `Ho trovato ${contacts.length} punt${contacts.length === 1 ? 'o' : 'i'} di contatto.`,
        options: [
          { id: 'snap', label: 'A incastro', hint: 'perni a pressione, senza colla', ops: [{ op: 'set_plan', connection: 'snap' }] },
          { id: 'glue', label: 'Da incollare', hint: 'perni di centraggio con gioco per la colla', ops: [{ op: 'set_plan', connection: 'glue' }] },
        ],
      });
    }
  }

  /* ---- Parti mobili → scatti ---- */
  const undecided = design.joints.filter((j) => j.detent === undefined);
  if (undecided.length) {
    const key = `detent:${undecided.map((j) => j.id).join(',')}`;
    if (!answered.has(key)) {
      const name = (id: string) => design.parts.find((p) => p.id === id)?.name ?? id;
      const all: DesignOp[] = undecided.map((j) => ({ op: 'update_joint', id: j.id, patch: { detent: { enabled: true } } }));
      const none: DesignOp[] = undecided.map((j) => ({ op: 'update_joint', id: j.id, patch: { detent: { enabled: false } } }));
      questions.push({
        id: key,
        key,
        source: 'analysis',
        text: 'Ci sono parti mobili. Vuoi che si fermino a scatto in alcune posizioni?',
        detail: 'Lo scatto le tiene ferme finché non le muovi con decisione.',
        multi: undecided.length > 1,
        baseOps: undecided.length > 1 ? none : undefined,
        options:
          undecided.length > 1
            ? undecided.map((j) => ({ id: j.id, label: name(j.partB), ops: [{ op: 'update_joint', id: j.id, patch: { detent: { enabled: true } } }] as DesignOp[] }))
            : [
                { id: 'yes', label: 'Sì, con scatto', ops: all },
                { id: 'no', label: 'No, movimento libero', ops: none },
              ],
      });
    }
  }

  /* ---- Cerniere stampate già montate con parti separate ---- */
  if (design.printPlan.strategy === 'separate') {
    const name = (id: string) => design.parts.find((x) => x.id === id)?.name ?? id;
    for (const j of design.joints.filter((x) => x.type !== 'slider')) {
      const fa = design.parts.find((x) => x.id === j.partA)?.filamentId;
      const fb = design.parts.find((x) => x.id === j.partB)?.filamentId;
      warnings.push(
        fa === fb
          ? `"${name(j.partA)}" e "${name(j.partB)}" sono unite da un'articolazione stampata già montata: restano insieme nello stesso piatto.`
          : `"${name(j.partA)}" e "${name(j.partB)}" hanno un'articolazione stampata già montata ma colori diversi: vanno stampate insieme (multicolore) oppure dello stesso colore.`,
      );
    }
  }

  /* ---- Bambini ---- */
  if (design.intendedUse.children) {
    const sharp = design.parts.map((p) => ({ p, n: sharpBoxes(p.shape) })).filter((x) => x.n > 0);
    const key = `round:${s}:${sharp.reduce((a, x) => a + x.n, 0)}`;
    if (sharp.length && !answered.has(key)) {
      questions.push({
        id: key,
        key,
        source: 'analysis',
        text: `È per bambini: arrotondo gli spigoli esterni (raggio ${CHILD_RADIUS} mm)?`,
        detail: `Spigoli vivi trovati in: ${sharp.map((x) => x.p.name).join(', ')}.`,
        options: [
          { id: 'yes', label: 'Sì, arrotonda', ops: sharp.map((x) => ({ op: 'update_part', id: x.p.id, shape: roundShape(x.p.shape) })) },
          { id: 'no', label: 'No, lascia così' },
        ],
      });
    }
    const separate = design.printPlan.strategy === 'separate';
    for (const p of parts) {
      const sz = [0, 1, 2].map((k) => p.bbox.max[k] - p.bbox.min[k]).sort((a, b) => a - b);
      const small = sz[1] < SMALL_PART.d && sz[2] < SMALL_PART.depth;
      const isLoose = separate || design.joints.some((j) => j.partB === p.id);
      if (small && isLoose) {
        const name = design.parts.find((x) => x.id === p.id)?.name ?? p.id;
        warnings.push(`"${name}" è piccola: se si stacca può essere ingerita. Non adatta a bambini sotto i 3 anni.`);
      }
    }
  }

  /* ---- Piatto e materiali ---- */
  for (const p of parts) {
    const size: Vec3 = [0, 1, 2].map((k) => p.bbox.max[k] - p.bbox.min[k]) as Vec3;
    if (!fitsBed(size, bed)) {
      const name = design.parts.find((x) => x.id === p.id)?.name ?? p.id;
      warnings.push(`"${name}" (${size.map((v) => v.toFixed(0)).join('×')} mm) non entra nel piatto ${bed.join('×')} mm.`);
    }
  }
  const usedMaterials = new Set(design.parts.map((p) => filById.get(p.filamentId ?? '')?.material).filter(Boolean) as string[]);
  for (const m of usedMaterials) {
    const info = material(m);
    if (info.needsEnclosure && !printer.enclosed) warnings.push(`${info.label} su una stampante aperta tende a deformarsi: valuta PLA o PETG.`);
  }
  for (const p of design.parts) if (p.filamentId && !filById.has(p.filamentId)) warnings.push(`La parte "${p.name}" usa un filamento che non hai più.`);

  const summary = recommended
    ? `Consigliato: ${STRATEGY_LABEL[recommended.strategy]} · ${fmtTime(recommended.timeS)} · ${recommended.filamentG.toFixed(0)} g${recommended.wasteG >= 1 ? ` (+${recommended.wasteG.toFixed(0)} g scarto)` : ''}`
    : parts.length
      ? 'Nessuna strategia di stampa possibile con la configurazione attuale.'
      : '';

  return { estimates, recommended, questions, warnings, summary };
}
