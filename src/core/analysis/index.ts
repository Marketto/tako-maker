import type { Design, PrinterSpec, Question, ShapeNode, UserSetup, Vec3 } from '../types';
import type { DesignOp } from '../design/ops';
import { walkShape } from '../design/ops';
import { findContacts, PEG_SPACING, type ButtonReport, type ConnectorReport, type OverlapReport } from '../geometry/evaluate';
import { printedTogether } from '../design/links';
import { material } from '../../data/materials';
import { bondsPoorly, guideline, minWall } from '../../data/guidelines';
import { materialsToTest, neededTests, TEST_KEYS, TEST_LABEL } from '../calibration/coupons';
import { isCalibrated } from '../calibration/tolerances';
import { bedOf, estimateStrategies, fitsBed, fmtTime, STRATEGY_LABEL, type PartStat, type StrategyEstimate } from './estimate';
import { fmtNum, t } from '../../i18n';
import { hardwareLabel, hardwareOf, toBuy } from '../hardware';

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
  extras: { connectors?: ConnectorReport[]; overlaps?: OverlapReport[]; buttons?: ButtonReport[] } = {},
): AnalysisReport {
  const questions: Question[] = [];
  const warnings: string[] = [];
  const s = sig(design);
  const pname0 = (id: string) => design.parts.find((x) => x.id === id)?.name ?? id;
  const bed = bedOf(setup, printer);
  const filById = new Map(setup.filaments.map((f) => [f.id, f]));

  /* ---- Strategia ---- */
  const linked = printedTogether(design);
  const estimates = estimateStrategies(parts, setup, printer, linked);
  const feasible = estimates.filter((e) => e.feasible);
  const recommended = feasible[0];
  const current = design.printPlan.strategy;
  const currentEst = estimates.find((e) => e.strategy === current);

  if (recommended && recommended.strategy !== current && parts.length > 0) {
    const key = `strategy:${recommended.strategy}:${s}`;
    if (!answered.has(key)) {
      const why = currentEst && currentEst.feasible
        ? t('Stima: {time} e {waste} g di scarto, contro {curTime} e {curWaste} g.', {
            time: fmtTime(recommended.timeS),
            waste: recommended.wasteG.toFixed(0),
            curTime: fmtTime(currentEst.timeS),
            curWaste: currentEst.wasteG.toFixed(0),
          })
        : currentEst?.reason
          ? t('La strategia attuale non è possibile: {reason}.', { reason: currentEst.reason.toLowerCase() })
          : undefined;
      questions.push({
        id: key,
        key,
        source: 'analysis',
        text: t('Conviene passare a: {strategy}?', { strategy: t(STRATEGY_LABEL[recommended.strategy]) }),
        detail: why,
        options: [
          { id: 'yes', label: t('Sì, cambia'), ops: [{ op: 'set_plan', strategy: recommended.strategy }] },
          { id: 'no', label: t('No, resta su {strategy}', { strategy: t(STRATEGY_LABEL[current]) }) },
        ],
      });
    }
  }

  /* ---- Elementi da comprare a parte: conferma per ognuno ---- */
  for (const h of hardwareOf(design)) {
    const item = hardwareLabel(h);
    if (h.decision === 'printed') {
      warnings.push(t('"{item}" va ancora sostituito con una soluzione stampata: chiedilo all\'assistente.', { item }));
      continue;
    }
    if (h.decision === 'buy') continue;
    const key = `hardware:${h.id}:${item}`;
    if (answered.has(key)) continue;
    questions.push({
      id: key,
      key,
      source: 'analysis',
      text: t('Serve un elemento da comprare a parte: {item}. Va bene o cerco un\'alternativa stampata?', { item }),
      detail: h.purpose ? t('Serve per: {purpose}.', { purpose: h.purpose }) : undefined,
      options: [
        { id: 'buy', label: t('Va bene, lo compro'), ops: [{ op: 'update_hardware', id: h.id, patch: { decision: 'buy' } }] },
        {
          id: 'printed',
          label: t('Cerca un\'alternativa stampata'),
          hint: t('usa l\'assistente AI'),
          ops: [{ op: 'update_hardware', id: h.id, patch: { decision: 'printed' } }],
          action: 'ask_ai',
          prompt: h.purpose
            ? t('Sostituisci "{item}" ({purpose}) con una soluzione stampata, senza elementi da comprare.', { item, purpose: h.purpose })
            : t('Sostituisci "{item}" con una soluzione stampata, senza elementi da comprare.', { item }),
        },
      ],
    });
  }
  if (design.intendedUse.children) {
    const small = toBuy(design);
    if (small.length)
      warnings.push(
        t('È per bambini: fissa bene gli elementi acquistati ({items}) in modo che non si possano staccare. Magneti e pile a bottone ingeriti sono molto pericolosi.', {
          items: small.map((h) => h.name).join(', '),
        }),
      );
  }

  /* ---- Cerniere tra parti di colori diversi senza multicolore ---- */
  const multiOk = estimates.find((e) => e.strategy === 'multicolor')?.feasible;
  if (!multiOk) {
    const partName = (id: string) => design.parts.find((x) => x.id === id)?.name ?? id;
    const fil = (id: string) => design.parts.find((x) => x.id === id)?.filamentId;
    const label = (id: string) => {
      const f = filById.get(fil(id) ?? '');
      return f ? `${f.material} ${t(f.colorName)}` : t('senza filamento');
    };
    for (const p of design.parts.filter((x) => x.button && fil(x.id) !== fil(x.button.housing))) {
      const h = p.button!.housing;
      const key = `buttoncolor:${p.id}:${s}`;
      if (answered.has(key)) continue;
      questions.push({
        id: key,
        key,
        source: 'analysis',
        text: t('Il pulsante "{button}" è stampato già montato in "{housing}": usiamo lo stesso colore?', { button: p.name, housing: partName(h) }),
        detail: t('Senza stampa multicolore devono uscire insieme dallo stesso piatto, quindi dello stesso filamento.'),
        options: [
          { id: 'a', label: t('Tutto {filament}', { filament: label(h) }), ops: [{ op: 'update_part', id: p.id, filamentId: fil(h) }] },
          { id: 'b', label: t('Tutto {filament}', { filament: label(p.id) }), ops: [{ op: 'update_part', id: h, filamentId: fil(p.id) }] },
          { id: 'no', label: t('Lascia così') },
        ],
      });
    }
    for (const j of design.joints.filter((x) => x.type !== 'slider' && fil(x.partA) !== fil(x.partB))) {
      const key = `jointcolor:${j.id}:${s}`;
      if (answered.has(key)) continue;
      questions.push({
        id: key,
        key,
        source: 'analysis',
        text: t('"{a}" e "{b}" sono unite da una cerniera stampata già montata: usiamo lo stesso colore?', { a: partName(j.partA), b: partName(j.partB) }),
        detail: t('Senza stampa multicolore devono uscire insieme dallo stesso piatto, quindi dello stesso filamento.'),
        options: [
          { id: 'a', label: t('Tutto {filament}', { filament: label(j.partA) }), ops: [{ op: 'update_part', id: j.partB, filamentId: fil(j.partA) }] },
          { id: 'b', label: t('Tutto {filament}', { filament: label(j.partB) }), ops: [{ op: 'update_part', id: j.partA, filamentId: fil(j.partB) }] },
          { id: 'no', label: t('Lascia così') },
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
        text: t('Come vuoi unire le parti?'),
        detail: contacts.length === 1 ? t('Ho trovato 1 punto di contatto.') : t('Ho trovato {n} punti di contatto.', { n: contacts.length }),
        options: [
          { id: 'snap', label: t('A incastro'), hint: t('perni a pressione, senza colla'), ops: [{ op: 'set_plan', connection: 'snap' }] },
          { id: 'glue', label: t('Da incollare'), hint: t('perni di centraggio con gioco per la colla'), ops: [{ op: 'set_plan', connection: 'glue' }] },
        ],
      });
    }
  }

  /* ---- Pulsanti: sporgenza e risposta alla pressione ---- */
  const btns = design.parts.filter((p) => p.button);
  const names = (list: typeof btns) => list.map((p) => `"${p.name}"`).join(', ');
  const noProt = btns.filter((p) => p.button!.protrusionMm === undefined);
  if (noProt.length) {
    const key = `button-prot:${noProt.map((p) => p.id).join(',')}`;
    if (!answered.has(key)) {
      const set = (mm: number): DesignOp[] => noProt.map((p) => ({ op: 'update_part', id: p.id, button: { protrusionMm: mm } }));
      questions.push({
        id: key,
        key,
        source: 'analysis',
        text: noProt.length === 1 ? t('Quanto deve sporgere il pulsante "{name}"?', { name: noProt[0].name }) : t('Quanto devono sporgere i pulsanti ({names})?', { names: names(noProt) }),
        detail: design.intendedUse.children ? t('Per i bambini è meglio che sporgano almeno 2 mm: si trovano e si premono più facilmente.') : undefined,
        options: [
          { id: '1', label: '1 mm', hint: t('quasi a filo, elegante'), ops: set(1) },
          { id: '2', label: '2 mm', hint: t('classico, facile da premere'), ops: set(2) },
          { id: '3', label: '3 mm', hint: t('ben in rilievo, si trova al tatto'), ops: set(3) },
        ],
      });
    }
  }
  const noFeel = btns.filter((p) => p.button!.feel === undefined);
  if (noFeel.length) {
    const key = `button-feel:${noFeel.map((p) => p.id).join(',')}`;
    if (!answered.has(key)) {
      const set = (feel: 'click' | 'soft'): DesignOp[] => noFeel.map((p) => ({ op: 'update_part', id: p.id, button: { feel } }));
      questions.push({
        id: key,
        key,
        source: 'analysis',
        text: noFeel.length === 1 ? t('Quando premi "{name}", deve fare "click" o essere morbido?', { name: noFeel[0].name }) : t('Quando li premi, i pulsanti ({names}) devono fare "click" o essere morbidi?', { names: names(noFeel) }),
        options: [
          { id: 'click', label: t('Con il click'), hint: t('si sente lo scatto, corsa breve'), ops: set('click') },
          { id: 'soft', label: t('Morbido'), hint: t('senza scatto, ritorno dolce'), ops: set('soft') },
        ],
      });
    }
  }
  for (const r of extras.buttons ?? []) {
    if (r.ok || !r.reason) continue;
    const vars = Object.fromEntries(Object.entries(r.reasonVars ?? {}).map(([k, v]) => [k, fmtNum(v, 1, 0)]));
    warnings.push(t(r.reason, { ...vars, name: pname0(r.id) }));
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
        text: t('Ci sono parti mobili. Vuoi che si fermino a scatto in alcune posizioni?'),
        detail: t('Lo scatto le tiene ferme finché non le muovi con decisione.'),
        multi: undecided.length > 1,
        baseOps: undecided.length > 1 ? none : undefined,
        options:
          undecided.length > 1
            ? undecided.map((j) => ({ id: j.id, label: name(j.partB), ops: [{ op: 'update_joint', id: j.id, patch: { detent: { enabled: true } } }] as DesignOp[] }))
            : [
                { id: 'yes', label: t('Sì, con scatto'), ops: all },
                { id: 'no', label: t('No, movimento libero'), ops: none },
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
          ? t('"{a}" e "{b}" sono unite da un\'articolazione stampata già montata: restano insieme nello stesso piatto.', { a: name(j.partA), b: name(j.partB) })
          : t('"{a}" e "{b}" hanno un\'articolazione stampata già montata ma colori diversi: vanno stampate insieme (multicolore) oppure dello stesso colore.', { a: name(j.partA), b: name(j.partB) }),
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
        text: t('È per bambini: arrotondo gli spigoli esterni (raggio {r} mm)?', { r: CHILD_RADIUS }),
        detail: t('Spigoli vivi trovati in: {parts}.', { parts: sharp.map((x) => x.p.name).join(', ') }),
        options: [
          { id: 'yes', label: t('Sì, arrotonda'), ops: sharp.map((x) => ({ op: 'update_part', id: x.p.id, shape: roundShape(x.p.shape) })) },
          { id: 'no', label: t('No, lascia così') },
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
        warnings.push(t('"{name}" è piccola: se si stacca può essere ingerita. Non adatta a bambini sotto i 3 anni.', { name }));
      }
    }
  }

  /* ---- Piatto e materiali ---- */
  for (const p of parts) {
    const size: Vec3 = [0, 1, 2].map((k) => p.bbox.max[k] - p.bbox.min[k]) as Vec3;
    if (!fitsBed(size, bed)) {
      const name = design.parts.find((x) => x.id === p.id)?.name ?? p.id;
      warnings.push(t('"{name}" ({size} mm) non entra nel piatto {bed} mm.', { name, size: size.map((v) => v.toFixed(0)).join('×'), bed: bed.join('×') }));
    }
  }
  const usedMaterials = new Set(design.parts.map((p) => filById.get(p.filamentId ?? '')?.material).filter(Boolean) as string[]);
  for (const m of usedMaterials) {
    const info = material(m);
    if (info.needsEnclosure && !printer.enclosed) warnings.push(t('{material} su una stampante aperta tende a deformarsi: valuta PLA o PETG.', { material: t(info.label) }));
  }
  for (const p of design.parts) if (p.filamentId && !filById.has(p.filamentId)) warnings.push(t('La parte "{name}" usa un filamento che non hai più.', { name: p.name }));

  /* ---- Coerenza della forma tra parti da assemblare ---- */
  const pname = (id: string) => design.parts.find((x) => x.id === id)?.name ?? id;
  const statOf = (id: string) => parts.find((p) => p.id === id);
  const jointed = new Set(design.joints.map((j) => [j.partA, j.partB].sort().join('|')));
  const fmt = (v: number) => fmtNum(v, 1);

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
      text: t('"{small}" entra dentro "{big}": ricavo in "{big}" la sede esatta, così le forme combaciano?', { small: pname(small), big: pname(big) }),
      detail: t('Si sovrappongono per circa {vol} cm³: stampate così non si potrebbero montare (o lo slicer le fonderebbe).', { vol: fmt(o.volume / 1000) }),
      options: [
        { id: 'yes', label: t('Sì, crea la sede'), ops: [{ op: 'update_part', id: big, shape: { op: 'difference', children: [bigPart.shape, smallPart.shape] } }] },
        { id: 'no', label: t('No, lascia così') },
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
              text: t('Tra "{a}" e "{b}" c\'è uno spazio di {gap} mm: le avvicino perché combacino?', { a: pname(ia), b: pname(ib), gap: fmt(gap) }),
              detail: design.printPlan.strategy === 'separate' ? t('Rimarrebbe una fessura visibile dopo il montaggio.') : t('Stampate insieme uscirebbero come pezzi staccati.'),
              options: [
                { id: 'yes', label: t('Sì, avvicinale'), ops: [{ op: 'move_part', id: mover, at }] },
                { id: 'no', label: t('No, lo spazio è voluto') },
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
                text: t('I bordi di "{a}" e "{b}" sono sfalsati di {off} mm: li allineo?', { a: pname(ia), b: pname(ib), off: fmt(Math.max(...offs.map(Math.abs))) }),
                detail: t('Hanno la stessa sagoma: allineate, il pezzo montato avrà bordi continui.'),
                options: [
                  { id: 'yes', label: t('Sì, allinea'), ops: [{ op: 'move_part', id: mover, at }] },
                  { id: 'no', label: t('No, è voluto') },
                ],
              });
          } else if (!sameSize) {
            const diff = Math.max(...sizes.map(([x, y]) => Math.abs(x - y)));
            warnings.push(t('"{a}" e "{b}" hanno sagome quasi uguali ma diverse di {diff} mm: i bordi non combaciano e si vedrà un gradino.', { a: pname(ia), b: pname(ib), diff: fmt(diff) }));
          }
        }
        break;
      }
    }

  // 4. Perni: ce ne devono essere almeno due vicino ai bordi per ogni coppia
  for (const c of extras.connectors ?? []) {
    const spacing = design.printPlan.connection === 'snap' ? PEG_SPACING.snap : PEG_SPACING.glue;
    if (c.pegs >= 2 && (c.maxSpanMm ?? 0) > spacing * 1.5)
      warnings.push(
        t('Tra "{a}" e "{b}" c\'è un tratto di bordo di circa {mm} mm senza ganci: lì le parti possono aprirsi. Allarga quel bordo (almeno 6 mm) per far posto a un gancio intermedio.', {
          a: pname(c.a),
          b: pname(c.b),
          mm: c.maxSpanMm!,
        }),
      );
    if (c.pegs >= 2) continue;
    if (c.pegs === 1) warnings.push(t('Tra "{a}" e "{b}" c\'è spazio per un solo perno: il pezzo può ruotare. Allarga i bordi di contatto o aggiungi colla.', { a: pname(c.a), b: pname(c.b) }));
    else warnings.push(t('Tra "{a}" e "{b}" non ho potuto mettere perni: {reason}.', { a: pname(c.a), b: pname(c.b), reason: t(c.reason ?? 'spazio insufficiente', Object.fromEntries(Object.entries(c.reasonVars ?? {}).map(([k, v]) => [k, fmtNum(v, 1)]))) }));
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
        text: t('Ci sono parti mobili o incastri: vuoi stampare prima dei campioni di prova per trovare il gioco giusto per la tua stampante?'),
        detail: t('Prove: {tests} · materiali: {materials}. Pochi minuti di stampa, poi scegli il campione migliore.', { tests: kinds.map((k) => t(TEST_LABEL[k]).toLowerCase()).join(', '), materials: todo.map((m) => m.material).join(', ') }),
        options: [
          { id: 'yes', label: t('Sì, prepara i campioni'), hint: t('un piatto per materiale'), action: 'calibration' },
          { id: 'no', label: t('No, uso i valori consigliati') },
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
  if (thin.length) {
    const vars = { wall: fmtNum(wall, 2, 0), nozzle: fmtNum(nozzle, 2, 0), parts: [...new Set(thin)].slice(0, 3).join(', ') + (thin.length > 3 ? '…' : '') };
    warnings.push(
      design.intendedUse.children
        ? t('Elementi più sottili del consigliato ({wall} mm con ugello {nozzle} mm, per bambini): {parts}.', vars)
        : t('Elementi più sottili del consigliato ({wall} mm con ugello {nozzle} mm): {parts}.', vars),
    );
  }

  const tall: string[] = [];
  for (const p of parts) {
    const sz = [0, 1, 2].map((k) => p.bbox.max[k] - p.bbox.min[k]);
    const name = design.parts.find((x) => x.id === p.id)?.name ?? p.id;
    const g = guideline(partMat(p.id));
    const foot = Math.min(sz[0], sz[1]);
    if (printer.kinematics === 'bedslinger' && sz[2] > 60 && sz[2] / Math.max(foot, 1) > 3) tall.push(`"${name}"`);
    if (g.warps && Math.max(sz[0], sz[1]) > 100) tips.push(t('"{name}" è grande in {material}: aggiungi un brim per evitare che gli angoli si sollevino.', { name, material: partMat(p.id) }));
  }

  if (tall.length) {
    warnings.push(
      tall.length === 1
        ? t('{parts} è alto e stretto: sulle stampanti a piatto mobile possono oscillare. Usa un brim o stampali coricati.', { parts: tall[0] })
        : t('{parts} sono alti e stretti: sulle stampanti a piatto mobile possono oscillare. Usa un brim o stampali coricati.', { parts: tall.join(', ') }),
    );
  }

  const articulated = design.joints.filter((j) => j.type !== 'slider');
  for (const j of articulated) {
    const name = design.parts.find((x) => x.id === j.partB)?.name ?? j.partB;
    if (j.axis === 'z' && j.type === 'hinge') warnings.push(t('La cerniera di "{name}" ha l\'asse verticale: stampata già montata funziona meglio con l\'asse parallelo al piatto.', { name }));
    if ([j.partA, j.partB].some((id) => partMat(id) === 'TPU')) warnings.push(t('La cerniera di "{name}" è in TPU: è flessibile, meglio PLA o PETG per le parti rigide.', { name }));
  }

  const usesSnap = (design.printPlan.strategy === 'separate' && design.printPlan.connection === 'snap') || articulated.some((j) => j.detent?.enabled);
  if (usesSnap) {
    const weak = [...new Set(design.parts.map((p) => partMat(p.id)))].filter((m) => !guideline(m).goodForSnap && m !== 'TPU');
    const hasPetg = setup.filaments.some((f) => guideline(f.material).goodForSnap);
    if (weak.length)
      tips.push(
        hasPetg
          ? t('Incastri e scatti in {materials} possono rompersi con l\'uso: per le parti che si muovono spesso usa il PETG che hai.', { materials: weak.join(', ') })
          : t('Incastri e scatti in {materials} possono rompersi con l\'uso: se puoi, per quelle parti usa PETG.', { materials: weak.join(', ') }),
      );
  }

  const fits = usesSnap || articulated.length > 0 || (design.printPlan.strategy === 'separate' && design.printPlan.connection !== 'none');
  for (const m of usedMaterials) {
    const g = guideline(m);
    if (fits && g.shrinkPct > 0.4) tips.push(t('{material} ritira circa lo {pct}%: per i pezzi da incastrare compensa la scala nello slicer (o fai i campioni di prova).', { material: m, pct: fmtNum(g.shrinkPct, 2, 0) }));
  }

  // Materiali che non aderiscono tra loro, stampati a contatto
  if (design.printPlan.strategy !== 'separate') {
    const contacts = findContacts(parts.map((p) => ({ id: p.id, box: p.contactBox ?? p.bbox })));
    const bad = new Set<string>();
    for (const c of contacts) {
      const a = partMat(c.a), b = partMat(c.b);
      if (bondsPoorly(a, b)) bad.add([a, b].sort().join('|'));
    }
    for (const pair of bad) {
      const [a, b] = pair.split('|');
      warnings.push(t('{a} e {b} aderiscono male tra loro: stampati a contatto le parti possono staccarsi. Usa lo stesso materiale o stampale separate.', { a, b }));
    }
  }

  const materialNotes = [...usedMaterials].map((m) => {
    const g = guideline(m);
    return { material: m, nozzleC: g.nozzleC, bedC: g.bedC, tips: g.tips.map((x) => t(x)) };
  });

  const summary = recommended
    ? t('Consigliato: {strategy} · {time} · {grams} g', { strategy: t(STRATEGY_LABEL[recommended.strategy]), time: fmtTime(recommended.timeS), grams: recommended.filamentG.toFixed(0) }) +
      (recommended.wasteG >= 1 ? t(' (+{waste} g scarto)', { waste: recommended.wasteG.toFixed(0) }) : '')
    : parts.length
      ? t('Nessuna strategia di stampa possibile con la configurazione attuale.')
      : '';

  return { estimates, recommended, questions, warnings, tips, materialNotes, summary };
}
