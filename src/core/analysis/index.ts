import type { Design, PrinterSpec, Question, ShapeNode, UserSetup, Vec3 } from '../types';
import type { DesignOp } from '../design/ops';
import { walkShape } from '../design/ops';
import { findContacts, type ConnectorReport, type OverlapReport } from '../geometry/evaluate';
import { material } from '../../data/materials';
import { bondsPoorly, guideline, minWall } from '../../data/guidelines';
import { materialsToTest, neededTests, TEST_KEYS, TEST_LABEL } from '../calibration/coupons';
import { isCalibrated } from '../calibration/tolerances';
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
  /** Consigli di buona pratica (meno urgenti degli avvisi). */
  tips: string[];
  /** Indicazioni per ogni materiale usato. */
  materialNotes: { material: string; nozzleC: [number, number]; bedC: [number, number]; tips: string[] }[];
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
  extras: { connectors?: ConnectorReport[]; overlaps?: OverlapReport[] } = {},
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

  /* ---- Coerenza della forma tra parti da assemblare ---- */
  const pname = (id: string) => design.parts.find((x) => x.id === id)?.name ?? id;
  const statOf = (id: string) => parts.find((p) => p.id === id);
  const jointed = new Set(design.joints.map((j) => [j.partA, j.partB].sort().join('|')));
  const fmt = (v: number) => v.toFixed(1).replace('.', ',');

  // 1. Compenetrazioni: si ricava nella parte più grande la sede esatta della più piccola
  for (const o of extras.overlaps ?? []) {
    const va = statOf(o.a)?.volume ?? 0;
    const vb = statOf(o.b)?.volume ?? 0;
    const [big, small] = va >= vb ? [o.a, o.b] : [o.b, o.a];
    const bigPart = design.parts.find((p) => p.id === big);
    const smallPart = design.parts.find((p) => p.id === small);
    if (!bigPart || !smallPart) continue;
    const key = `overlap:${[o.a, o.b].sort().join('|')}:${Math.round(o.volume)}`;
    if (answered.has(key)) continue;
    questions.push({
      id: key,
      key,
      source: 'analysis',
      text: `"${pname(small)}" entra dentro "${pname(big)}": ricavo in "${pname(big)}" la sede esatta, così le forme combaciano?`,
      detail: `Si sovrappongono per circa ${fmt(o.volume / 1000)} cm³: stampate così non si potrebbero montare (o lo slicer le fonderebbe).`,
      options: [
        { id: 'yes', label: 'Sì, crea la sede', ops: [{ op: 'update_part', id: big, shape: { op: 'difference', children: [bigPart.shape, smallPart.shape] } }] },
        { id: 'no', label: 'No, lascia così' },
      ],
    });
  }

  // 2. Parti quasi a contatto (piccolo spazio non voluto) e 3. bordi non allineati
  const boxOf = (id: string) => statOf(id)?.contactBox ?? statOf(id)?.bbox;
  for (let i = 0; i < parts.length; i++)
    for (let k = i + 1; k < parts.length; k++) {
      const A = boxOf(parts[i].id)!;
      const B = boxOf(parts[k].id)!;
      const ia = parts[i].id, ib = parts[k].id;
      if (jointed.has([ia, ib].sort().join('|'))) continue;
      for (const axis of [2, 0, 1] as const) {
        const o1 = ((axis + 1) % 3) as 0 | 1 | 2;
        const o2 = ((axis + 2) % 3) as 0 | 1 | 2;
        const ov = (d: number) => Math.min(A.max[d], B.max[d]) - Math.max(A.min[d], B.min[d]);
        const minFace = (d: number) => Math.min(A.max[d] - A.min[d], B.max[d] - B.min[d]);
        if (ov(o1) < minFace(o1) * 0.5 || ov(o2) < minFace(o2) * 0.5) continue;
        const gapUp = B.min[axis] - A.max[axis];
        const gapDown = A.min[axis] - B.max[axis];
        const gap = gapUp > 0 ? gapUp : gapDown > 0 ? gapDown : 0;
        if (gap > 0.05 && gap <= 2) {
          const mover = (statOf(ia)?.volume ?? 0) < (statOf(ib)?.volume ?? 0) ? ia : ib;
          const towards = mover === ib ? (gapUp > 0 ? -1 : 1) : gapUp > 0 ? 1 : -1;
          const at: Vec3 = [0, 0, 0];
          at[axis] = towards * gap;
          const key = `gap:${[ia, ib].sort().join('|')}:${gap.toFixed(2)}`;
          if (!answered.has(key))
            questions.push({
              id: key,
              key,
              source: 'analysis',
              text: `Tra "${pname(ia)}" e "${pname(ib)}" c'è uno spazio di ${fmt(gap)} mm: le avvicino perché combacino?`,
              detail: design.printPlan.strategy === 'separate' ? 'Rimarrebbe una fessura visibile dopo il montaggio.' : 'Stampate insieme uscirebbero come pezzi staccati.',
              options: [
                { id: 'yes', label: 'Sì, avvicinale', ops: [{ op: 'move_part', id: mover, at }] },
                { id: 'no', label: 'No, lo spazio è voluto' },
              ],
            });
          break;
        }
        // Facce a contatto: le sagome dovrebbero combaciare se sono quasi uguali
        if (Math.abs(gap) <= 0.05 && (Math.abs(B.min[axis] - A.max[axis]) <= 0.3 || Math.abs(A.min[axis] - B.max[axis]) <= 0.3)) {
          const sizes = [o1, o2].map((d) => [A.max[d] - A.min[d], B.max[d] - B.min[d]]);
          const near = sizes.every(([x, y]) => Math.abs(x - y) <= 3 && Math.min(x, y) > 5);
          if (!near) break;
          const offs = [o1, o2].map((d) => (B.min[d] + B.max[d]) / 2 - (A.min[d] + A.max[d]) / 2);
          const sameSize = sizes.every(([x, y]) => Math.abs(x - y) <= 0.3);
          const misaligned = offs.some((o) => Math.abs(o) > 0.2);
          if (sameSize && misaligned) {
            const mover = (statOf(ia)?.volume ?? 0) < (statOf(ib)?.volume ?? 0) ? ia : ib;
            const at: Vec3 = [0, 0, 0];
            [o1, o2].forEach((d, n) => (at[d] = mover === ib ? -offs[n] : offs[n]));
            const key = `align:${[ia, ib].sort().join('|')}:${offs.map((o) => o.toFixed(1)).join(',')}`;
            if (!answered.has(key))
              questions.push({
                id: key,
                key,
                source: 'analysis',
                text: `I bordi di "${pname(ia)}" e "${pname(ib)}" sono sfalsati di ${fmt(Math.max(...offs.map(Math.abs)))} mm: li allineo?`,
                detail: 'Hanno la stessa sagoma: allineate, il pezzo montato avrà bordi continui.',
                options: [
                  { id: 'yes', label: 'Sì, allinea', ops: [{ op: 'move_part', id: mover, at }] },
                  { id: 'no', label: 'No, è voluto' },
                ],
              });
          } else if (!sameSize) {
            const diff = Math.max(...sizes.map(([x, y]) => Math.abs(x - y)));
            warnings.push(`"${pname(ia)}" e "${pname(ib)}" hanno sagome quasi uguali ma diverse di ${fmt(diff)} mm: i bordi non combaciano e si vedrà un gradino.`);
          }
        }
        break;
      }
    }

  // 4. Perni: ce ne devono essere almeno due vicino ai bordi per ogni coppia
  for (const c of extras.connectors ?? []) {
    if (c.pegs >= 2) continue;
    if (c.pegs === 1) warnings.push(`Tra "${pname(c.a)}" e "${pname(c.b)}" c'è spazio per un solo perno: il pezzo può ruotare. Allarga i bordi di contatto o aggiungi colla.`);
    else warnings.push(`Tra "${pname(c.a)}" e "${pname(c.b)}" non ho potuto mettere perni: ${c.reason ?? 'spazio insufficiente'}.`);
  }

  /* ---- Campioni di prova per giunti e incastri ---- */
  const kinds = neededTests(design);
  if (kinds.length && parts.length) {
    const mats = materialsToTest(design, setup);
    const todo = mats.filter((m) => kinds.some((k) => !isCalibrated(m.material, setup, TEST_KEYS[k])));
    const key = `calib:${kinds.join(',')}:${todo.map((m) => m.material).join(',')}`;
    if (todo.length && !answered.has(key)) {
      questions.push({
        id: key,
        key,
        source: 'analysis',
        text: 'Ci sono parti mobili o incastri: vuoi stampare prima dei campioni di prova per trovare il gioco giusto per la tua stampante?',
        detail: `Prove: ${kinds.map((k) => TEST_LABEL[k].toLowerCase()).join(', ')} · materiali: ${todo.map((m) => m.material).join(', ')}. Pochi minuti di stampa, poi scegli il campione migliore.`,
        options: [
          { id: 'yes', label: 'Sì, prepara i campioni', hint: 'un piatto per materiale', action: 'calibration' },
          { id: 'no', label: 'No, uso i valori consigliati' },
        ],
      });
    }
  }

  /* ---- Linee guida per stampante e materiali ---- */
  const tips: string[] = [];
  const nozzle = setup.nozzle ?? printer.nozzle ?? 0.4;
  const wall = minWall(nozzle, design.intendedUse.children);
  const partMat = (id: string) => filById.get(design.parts.find((x) => x.id === id)?.filamentId ?? '')?.material ?? 'PLA';
  const thin: string[] = [];
  for (const p of design.parts) {
    walkShape(p.shape, (node, ctx) => {
      if (node.op === 'box' && !ctx.subtractive && Math.min(...node.size) < wall - 0.01) thin.push(`${p.name} (${Math.min(...node.size)} mm)`);
    });
  }
  if (thin.length) warnings.push(`Elementi più sottili del consigliato (${wall.toString().replace('.', ',')} mm con ugello ${nozzle} mm${design.intendedUse.children ? ', per bambini' : ''}): ${[...new Set(thin)].slice(0, 3).join(', ')}${thin.length > 3 ? '…' : ''}.`);

  const tall: string[] = [];
  for (const p of parts) {
    const sz = [0, 1, 2].map((k) => p.bbox.max[k] - p.bbox.min[k]);
    const name = design.parts.find((x) => x.id === p.id)?.name ?? p.id;
    const g = guideline(partMat(p.id));
    const foot = Math.min(sz[0], sz[1]);
    if (printer.kinematics === 'bedslinger' && sz[2] > 60 && sz[2] / Math.max(foot, 1) > 3) tall.push(`"${name}"`);
    if (g.warps && Math.max(sz[0], sz[1]) > 100) tips.push(`"${name}" è grande in ${partMat(p.id)}: aggiungi un brim per evitare che gli angoli si sollevino.`);
  }

  if (tall.length) {
    warnings.push(`${tall.join(', ')} ${tall.length === 1 ? 'è alto e stretto' : 'sono alti e stretti'}: sulle stampanti a piatto mobile possono oscillare. Usa un brim o stampali coricati.`);
  }

  const articulated = design.joints.filter((j) => j.type !== 'slider');
  for (const j of articulated) {
    const name = design.parts.find((x) => x.id === j.partB)?.name ?? j.partB;
    if (j.axis === 'z' && j.type === 'hinge') warnings.push(`La cerniera di "${name}" ha l'asse verticale: stampata già montata funziona meglio con l'asse parallelo al piatto.`);
    if ([j.partA, j.partB].some((id) => partMat(id) === 'TPU')) warnings.push(`La cerniera di "${name}" è in TPU: è flessibile, meglio PLA o PETG per le parti rigide.`);
  }

  const usesSnap = (design.printPlan.strategy === 'separate' && design.printPlan.connection === 'snap') || articulated.some((j) => j.detent?.enabled);
  if (usesSnap) {
    const weak = [...new Set(design.parts.map((p) => partMat(p.id)))].filter((m) => !guideline(m).goodForSnap && m !== 'TPU');
    const hasPetg = setup.filaments.some((f) => guideline(f.material).goodForSnap);
    if (weak.length) tips.push(`Incastri e scatti in ${weak.join(', ')} possono rompersi con l'uso: ${hasPetg ? 'per le parti che si muovono spesso usa il PETG che hai.' : 'se puoi, per quelle parti usa PETG.'}`);
  }

  const fits = usesSnap || articulated.length > 0 || (design.printPlan.strategy === 'separate' && design.printPlan.connection !== 'none');
  for (const m of usedMaterials) {
    const g = guideline(m);
    if (fits && g.shrinkPct > 0.4) tips.push(`${m} ritira circa lo ${g.shrinkPct.toString().replace('.', ',')}%: per i pezzi da incastrare compensa la scala nello slicer (o fai i campioni di prova).`);
  }

  // Materiali che non aderiscono tra loro, stampati a contatto
  if (design.printPlan.strategy !== 'separate') {
    const contacts = findContacts(parts.map((p) => ({ id: p.id, box: p.contactBox ?? p.bbox })));
    const bad = new Set<string>();
    for (const c of contacts) {
      const a = partMat(c.a), b = partMat(c.b);
      if (bondsPoorly(a, b)) bad.add([a, b].sort().join(' e '));
    }
    for (const pair of bad) warnings.push(`${pair} aderiscono male tra loro: stampati a contatto le parti possono staccarsi. Usa lo stesso materiale o stampale separate.`);
  }

  const materialNotes = [...usedMaterials].map((m) => {
    const g = guideline(m);
    return { material: m, nozzleC: g.nozzleC, bedC: g.bedC, tips: g.tips };
  });

  const summary = recommended
    ? `Consigliato: ${STRATEGY_LABEL[recommended.strategy]} · ${fmtTime(recommended.timeS)} · ${recommended.filamentG.toFixed(0)} g${recommended.wasteG >= 1 ? ` (+${recommended.wasteG.toFixed(0)} g scarto)` : ''}`
    : parts.length
      ? 'Nessuna strategia di stampa possibile con la configurazione attuale.'
      : '';

  return { estimates, recommended, questions, warnings, tips, materialNotes, summary };
}
