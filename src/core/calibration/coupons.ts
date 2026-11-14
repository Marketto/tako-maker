import type { Design, Filament, Joint, Part, ShapeNode, Tolerances, UserSetup, Vec3 } from '../types';
import { isCalibrated, tolerancesFor } from './tolerances';
import { fmtNum, msg, t } from '../../i18n';

/* Campioni di prova ricavati dal modello: si ritagliano i pezzi veri attorno alle parti incerte.
   - giunti (cerniere, perni rotanti, scatti): 3 campioni con giochi diversi, centrati sul consigliato;
     i segni incavati (1–3) identificano il campione dopo la stampa;
   - incastri disegnati tra parti separate e prove dichiarate nel modello (`samples`): 1 campione,
     per controllare la misura prima di stampare il pezzo intero;
   - perni aggiunti dall'app (incastro a pressione o da incollare): 3 campioni generici. */

export type TestKind = 'hinge' | 'rotary' | 'detent' | 'snap' | 'glue';
/** `fit`: prova di misura senza valori da tarare. */
export type SampleKind = TestKind | 'fit';

export const TEST_LABEL: Record<TestKind, string> = {
  hinge: msg('Cerniera (gioco)'),
  rotary: msg('Perno rotante (gioco)'),
  detent: msg('Scatto'),
  snap: msg('Incastro a pressione'),
  glue: msg('Perno da incollare'),
};

export const TEST_HOWTO: Record<TestKind, string> = {
  hinge: msg('Muovi le cerniere: scegli il gioco più piccolo che si sblocca e gira liscio.'),
  rotary: msg('Infila il pezzo forato sul perno: scegli il gioco più piccolo con cui gira libero senza ballare.'),
  detent: msg('Scegli lo scatto più netto che si muove ancora senza forzare troppo.'),
  snap: msg('Inserisci i perni: scegli quello che entra premendo con decisione e poi non si sfila da solo.'),
  glue: msg('Scegli il perno che entra a mano senza forzare, con il minimo gioco.'),
};

const FIT_HOWTO = msg('Monta i pezzi: se entrano a fatica o ballano, dillo all’assistente prima di stampare il modello.');

const OFFSETS = [-0.1, 0, 0.1];
const r2 = (v: number) => Math.round(v * 100) / 100;

/** Quale tolleranza modifica ciascun test. */
export function applyTestValue(kind: TestKind, v: number): Partial<Tolerances> {
  switch (kind) {
    case 'hinge':
      return { hingeGap: v, pinClearance: r2(Math.max(0.1, v - 0.05)) };
    case 'rotary':
      return { pinClearance: v };
    case 'detent':
      return { detentClearance: v };
    case 'snap':
      return { pegSnap: v };
    case 'glue':
      return { pegGlue: v };
  }
}

export function centerValue(kind: TestKind, t: Tolerances): number {
  return kind === 'hinge' ? t.hingeGap : kind === 'rotary' ? t.pinClearance : kind === 'detent' ? t.detentClearance : kind === 'snap' ? t.pegSnap : t.pegGlue;
}

export function testValues(kind: TestKind, material: string): number[] {
  // Centrati sul valore consigliato per il materiale (non su quello già calibrato,
  // così ripetere la prova esplora sempre lo stesso intervallo ragionevole).
  const c = centerValue(kind, tolerancesFor(material));
  return OFFSETS.map((o) => r2(Math.max(0, c + o)));
}

export const TEST_KEYS: Record<TestKind, (keyof Tolerances)[]> = {
  hinge: ['hingeGap', 'pinClearance'],
  rotary: ['pinClearance'],
  detent: ['detentClearance'],
  snap: ['pegSnap'],
  glue: ['pegGlue'],
};

/** Giochi da tarare per il modello corrente: solo i tipi di giunto che ci sono davvero. */
export function neededTests(design: Design): TestKind[] {
  const out: TestKind[] = [];
  const articulated = design.joints.filter((j) => j.type === 'hinge' || j.type === 'rotary');
  if (articulated.some((j) => j.type === 'hinge')) out.push('hinge');
  if (articulated.some((j) => j.type === 'rotary')) out.push('rotary');
  if (articulated.some((j) => j.detent?.enabled)) out.push('detent');
  if (design.printPlan.strategy === 'separate' && design.printPlan.connection === 'snap') out.push('snap');
  if (design.printPlan.strategy === 'separate' && design.printPlan.connection === 'glue') out.push('glue');
  return out;
}

/** Materiali delle parti coinvolte in giunti o incastri, con il filamento da usare per i campioni. */
export function materialsToTest(design: Design, setup: UserSetup): { material: string; filament: Filament }[] {
  const fil = new Map(setup.filaments.map((f) => [f.id, f]));
  const ids = new Set<string>();
  for (const j of design.joints) ids.add(j.partA).add(j.partB);
  if (design.printPlan.strategy === 'separate' && design.printPlan.connection !== 'none') design.parts.forEach((p) => ids.add(p.id));
  for (const s of design.samples ?? []) for (const r of s.regions) ids.add(r.part);
  const out = new Map<string, Filament>();
  for (const p of design.parts) {
    if (!ids.has(p.id)) continue;
    const f = fil.get(p.filamentId ?? '') ?? setup.filaments[0];
    if (f && !out.has(f.material)) out.set(f.material, f);
  }
  return [...out].map(([material, filament]) => ({ material, filament }));
}

/* ---------- Serie di campioni ---------- */

export type Box3 = { min: Vec3; max: Vec3 };
/** Ingombro di una parte calcolata, con la mesh se disponibile (serve a trovare la zona esatta degli agganci). */
export type PartBox = Box3 & { mesh?: { positions: Float32Array } };

/** Ingombro dei vertici della mesh che cadono dentro la scatola (null se nessuno). */
function meshInside(mesh: { positions: Float32Array }, b: Box3): Box3 | null {
  const min: Vec3 = [Infinity, Infinity, Infinity];
  const max: Vec3 = [-Infinity, -Infinity, -Infinity];
  const p = mesh.positions;
  for (let i = 0; i < p.length; i += 3) {
    if ([0, 1, 2].some((k) => p[i + k] < b.min[k] - 0.01 || p[i + k] > b.max[k] + 0.01)) continue;
    for (let k = 0; k < 3; k++) {
      min[k] = Math.min(min[k], p[i + k]);
      max[k] = Math.max(max[k], p[i + k]);
    }
  }
  return min[0] === Infinity ? null : { min, max };
}

/** Come mettere sul piatto i pezzi di un campione (vedi arrange.ts). */
export type Arrange =
  | { mode: 'asis' } // pezzi già sistemati (o da stampare montati, come le cerniere)
  | { mode: 'axis'; axis: 0 | 1 | 2; dir: 1 | -1 } // asse del giunto in verticale, pezzi affiancati
  | { mode: 'flat' }; // pezzi affiancati, ciascuno nel verso con meno sporgenze

export interface SampleSeries {
  /** Identificativo stabile (per la domanda automatica). */
  id: string;
  kind: SampleKind;
  /** Nome per l'utente, già tradotto. */
  name: string;
  /** Istruzioni per l'utente, già tradotte. */
  howto: string;
  /** Quali pezzi si stampano e da quali parti del modello vengono, già tradotto. */
  pieces: string;
  material: string;
  filament: Filament;
  /** Valori provati (3 per i giochi); assenti per le prove di misura (1 campione). */
  values?: number[];
  /** Il pezzo con il perno è uguale in tutte le varianti: se ne stampa uno solo (cambia solo il foro). */
  sharedPin?: boolean;
}

interface SeriesBuilder extends SampleSeries {
  build(index: number, value?: number): { design: Design; tol: Record<string, Tolerances>; arrange: Arrange; size: [number, number]; drop?: string[] };
}

export interface Coupon {
  id: string;
  series: SampleSeries;
  index: number;
  value?: number;
  material: string;
  design: Design;
  /** Tolleranze per parte (id delle parti del campione). */
  tol: Record<string, Tolerances>;
  arrange: Arrange;
  /** Ingombro sul piatto [x, y]: stimato, poi ricalcolato dopo aver sistemato i pezzi. */
  size: [number, number];
  /** Parti calcolate ma non stampate (il perno condiviso, già presente nella prima variante). */
  drop?: string[];
}

const box = (size: Vec3, at?: Vec3, radius = 0.6): ShapeNode => ({ op: 'box', size, at, radius });

function dots(n: number, z: number, x0 = 3, y0 = 3): ShapeNode[] {
  return Array.from({ length: n }, (_, k) => ({ op: 'sphere', r: 1, at: [x0 + k * 3.4, y0, z] }) as ShapeNode);
}

const VALUE_LABEL = (v: number) => `${fmtNum(v, 2)} mm`;
const DOT_LABEL = (n: number) => '●'.repeat(n);

function couponDesign(name: string, parts: Part[], joints: Design['joints'] = []): Design {
  return { version: 1, name, intendedUse: { children: false }, parts, joints, printPlan: { strategy: 'separate', connection: 'none' } };
}

const AXES = ['x', 'y', 'z'] as const;

function clipBox(b: Box3): ShapeNode {
  return { op: 'box', size: [0, 1, 2].map((k) => b.max[k] - b.min[k]) as Vec3, at: b.min };
}

/** La parte ritagliata nella scatola, con eventuali segni incavati. Il nome dice il ruolo e la parte d'origine. */
function cropped(p: Part, region: Box3, id = p.id, marks: ShapeNode[] = [], name = t('ritaglio di «{part}»', { part: p.name })): Part {
  const clip: ShapeNode = { op: 'intersection', children: [p.shape, clipBox(region)] };
  return { id, name, filamentId: p.filamentId, shape: marks.length ? { op: 'difference', children: [clip, ...marks] } : clip };
}

/** n segni (sfere incavate) sul piano perpendicolare all'asse alla quota `at`, in fila a partire da `start` dall'asse. */
function axisMarks(n: number, axis: number, origin: Vec3, at: number, start: number, step: number, r: number): ShapeNode[] {
  const u = (axis + 1) % 3;
  return Array.from({ length: n }, (_, k) => {
    const c: Vec3 = [...origin];
    c[axis] = at;
    c[u] += start + k * step;
    return { op: 'sphere', r, at: c } as ShapeNode;
  });
}

function center(b: Box3, k: number): number {
  return (b.min[k] + b.max[k]) / 2;
}

/** Campioni ritagliati attorno a un giunto del modello. */
function jointSeries(kind: TestKind, j: Joint, design: Design, setup: UserSetup, filament: Filament, boxes: Record<string, Box3>): SeriesBuilder {
  const a = AXES.indexOf(j.axis);
  const hinge = j.type === 'hinge';
  const L = j.length ?? (hinge ? 30 : 10);
  const R = j.radius ?? (hinge ? 4 : 5);
  const partA = design.parts.find((p) => p.id === j.partA)!;
  const partB = design.parts.find((p) => p.id === j.partB)!;
  // Da che parte dell'asse sta il pezzo mobile: il perno di A punta verso B.
  const bb = boxes[j.partB];
  const dir: 1 | -1 = bb && center(bb, a) < j.origin[a] ? -1 : 1;
  const half = hinge ? L / 2 : L / 2 + 4;
  const region: Box3 = { min: [...j.origin], max: [...j.origin] };
  for (let k = 0; k < 3; k++) {
    const h = k === a ? half : R + 5;
    region.min[k] -= h;
    region.max[k] += h;
  }
  const material = filament.material;
  const values = testValues(kind, material);
  const fil = new Map(setup.filaments.map((f) => [f.id, f.material]));
  const tolOf = (p: Part) => tolerancesFor(fil.get(p.filamentId ?? '') ?? material, setup);
  const name = `${t(TEST_LABEL[kind])}: ${partB.name}`;
  // Nei perni rotanti il gioco sta tutto nel foro di B: il pezzo A è identico nelle 3 varianti.
  // Fa eccezione la prova del gioco su un giunto con scatto, dove il dentino di A si sposta col gioco.
  const sharedPin = !hinge && !(kind === 'rotary' && j.detent?.enabled);
  const names = { a: partA.name, b: partB.name };
  const pieces = hinge
    ? t('3 cerniere già montate, ritagliate da «{a}» e «{b}», segnate da ● a ●●●.', names)
    : sharedPin
      ? t('Un blocco con il perno, ritagliato da «{a}», e 3 blocchi forati ritagliati da «{b}», segnati da ● a ●●●.', names)
      : t('3 coppie di perno e blocco forato, ritagliate da «{a}» e «{b}», segnate da ● a ●●●.', names);
  return {
    id: `${kind}:${j.id}`,
    kind,
    name,
    howto: t(TEST_HOWTO[kind]),
    pieces,
    material,
    filament,
    values,
    sharedPin,
    build(index, value) {
      const n = index + 1;
      let marksA: ShapeNode[];
      let marksB: ShapeNode[] = [];
      if (hinge) {
        // Cerniera stampata montata: segni sulla testa della nocca di A.
        marksA = axisMarks(n, a, j.origin, j.origin[a] - L / 2, 0, 1.3, 0.5);
      } else {
        // Perno rotante: segni sulle facce lontane dal giunto, fuori dal foro.
        const s = R * 0.5 + 1.6;
        marksA = sharedPin ? [] : axisMarks(n, a, j.origin, j.origin[a] - dir * half, s, 1.8, 0.7);
        marksB = axisMarks(n, a, j.origin, j.origin[a] + dir * half, s, 1.8, 0.7);
      }
      const parts = hinge
        ? [cropped(partA, region, partA.id, marksA), cropped(partB, region, partB.id, marksB)]
        : [
            cropped(partA, region, partA.id, marksA, t('perno da «{part}»', { part: partA.name })),
            cropped(partB, region, partB.id, marksB, t('foro da «{part}»', { part: partB.name })),
          ];
      const extra = value === undefined ? {} : applyTestValue(kind, value);
      const tol = { [partA.id]: { ...tolOf(partA), ...extra }, [partB.id]: { ...tolOf(partB), ...extra } };
      const tag = `${name} ${value === undefined ? '' : VALUE_LABEL(value)} ${DOT_LABEL(n)}`;
      const arrange: Arrange = hinge ? { mode: 'asis' } : { mode: 'axis', axis: a as 0 | 1 | 2, dir };
      const w = 2 * (R + 5);
      return {
        design: couponDesign(tag, parts, [{ ...j }]),
        tol,
        arrange,
        size: hinge ? [region.max[0] - region.min[0], region.max[1] - region.min[1]] : [2 * w + 4, w],
        drop: sharedPin && index > 0 ? [partA.id] : undefined,
      };
    },
  };
}

/** Perni aggiunti dall'app tra parti separate: campioni generici (perno e blocco con foro). */
function pegSeries(kind: 'snap' | 'glue', material: string, filament: Filament, setup: UserSetup): SeriesBuilder {
  const name = t(TEST_LABEL[kind]);
  return {
    id: `${kind}:${material}`,
    kind,
    name,
    howto: t(TEST_HOWTO[kind]),
    pieces: t('Un blocco con il perno e 3 blocchi forati, segnati da ● a ●●●.'),
    material,
    filament,
    values: testValues(kind, material),
    sharedPin: true,
    build(index, value = 0) {
      const n = index + 1;
      const tag = `${name} ${VALUE_LABEL(value)} ${DOT_LABEL(n)}`;
      const parts: Part[] = [
        { id: 'a', name: t('perno'), filamentId: filament.id, shape: { op: 'union', children: [box([16, 16, 5]), { op: 'cylinder', h: 5, r: 2.5, at: [8, 8, 4] }] } },
        {
          id: 'b',
          name: t('foro'),
          filamentId: filament.id,
          shape: { op: 'difference', children: [box([16, 16, 6], [22, 0, 0]), { op: 'cylinder', h: 4.6, r: 2.5 + value, at: [30, 8, -0.01] }, ...dots(n, 6, 25, 3)] },
        },
      ];
      const tol = { ...tolerancesFor(material, setup), ...applyTestValue(kind, value) };
      return { design: couponDesign(tag, parts), tol: { a: tol, b: tol }, arrange: { mode: 'asis' }, size: [38, 16], drop: index > 0 ? ['a'] : undefined };
    },
  };
}

/** Prova di misura (1 campione): pezzi del modello ritagliati nelle zone indicate. */
function fitSeries(id: string, name: string, howto: string, regions: { part: Part; box: Box3 }[], filament: Filament, setup: UserSetup): SeriesBuilder {
  return {
    id,
    kind: 'fit',
    name,
    howto,
    pieces: t('Ritagli del modello nella zona da provare: {parts}.', { parts: [...new Set(regions.map((r) => `«${r.part.name}»`))].join(', ') }),
    material: filament.material,
    filament,
    build() {
      const fil = new Map(setup.filaments.map((f) => [f.id, f.material]));
      const parts = regions.map((r, i) => cropped(r.part, r.box, regions.length > 1 ? `${r.part.id}-${i + 1}` : r.part.id));
      const tol = Object.fromEntries(parts.map((p) => [p.id, tolerancesFor(fil.get(p.filamentId ?? '') ?? filament.material, setup)]));
      const w = regions.reduce((s, r) => s + Math.max(r.box.max[0] - r.box.min[0], r.box.max[1] - r.box.min[1], r.box.max[2] - r.box.min[2]) + 4, -4);
      const d = Math.max(...regions.map((r) => Math.max(r.box.max[0] - r.box.min[0], r.box.max[1] - r.box.min[1], r.box.max[2] - r.box.min[2])));
      return { design: couponDesign(name, parts), tol, arrange: { mode: 'flat' }, size: [w, d] };
    },
  };
}

/** Coppie di parti separate con un aggancio disegnato nel modello: i loro ingombri si compenetrano. */
export function fitPairs(design: Design, boxes: Record<string, PartBox>): { a: Part; b: Part; region: Box3 }[] {
  if (design.printPlan.strategy !== 'separate' || design.printPlan.connection !== 'designed') return [];
  const linked = new Set(design.joints.flatMap((j) => [`${j.partA}|${j.partB}`, `${j.partB}|${j.partA}`]));
  const out: { a: Part; b: Part; region: Box3 }[] = [];
  const seen = new Set<string>();
  const vol = (b: Box3) => (b.max[0] - b.min[0]) * (b.max[1] - b.min[1]) * (b.max[2] - b.min[2]);
  const parts = design.parts.filter((p) => boxes[p.id] && !p.button);
  for (let i = 0; i < parts.length; i++)
    for (let k = i + 1; k < parts.length; k++) {
      const [p, q] = [parts[i], parts[k]];
      if (linked.has(`${p.id}|${q.id}`)) continue;
      const A = boxes[p.id];
      const B = boxes[q.id];
      let lo = [0, 1, 2].map((d) => Math.max(A.min[d], B.min[d]));
      let hi = [0, 1, 2].map((d) => Math.min(A.max[d], B.max[d]));
      if ([0, 1, 2].some((d) => hi[d] - lo[d] <= 1)) continue;
      // Con la mesh si restringe la zona alla parte del pezzo più piccolo che entra nell'ingombro dell'altro
      // (un supporto con un braccio lungo non deve allargare il campione).
      const [big, small] = vol(A) >= vol(B) ? [A, B] : [B, A];
      if (small.mesh) {
        const inside = meshInside(small.mesh, big);
        if (!inside) continue;
        lo = [0, 1, 2].map((d) => Math.max(lo[d], inside.min[d]));
        hi = [0, 1, 2].map((d) => Math.min(hi[d], inside.max[d]));
        if ([0, 1, 2].some((d) => hi[d] - lo[d] <= 1)) continue;
      }
      const region: Box3 = {
        min: [0, 1, 2].map((d) => Math.max(lo[d] - 5, Math.min(A.min[d], B.min[d]))) as Vec3,
        max: [0, 1, 2].map((d) => Math.min(hi[d] + 5, Math.max(A.max[d], B.max[d]))) as Vec3,
      };
      // Lo stesso aggancio ripetuto (es. più supporti sulla stessa base) si prova una volta sola.
      const [host, guest] = vol(A) >= vol(B) ? [p, q] : [q, p];
      const key = `${host.id}|${[0, 1, 2].map((d) => Math.round(hi[d] - lo[d])).join('x')}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ a: host, b: guest, region });
    }
  return out;
}

/**
 * Le prove utili per il modello: un campione ritagliato per ogni tipo di giunto (per materiale),
 * per ogni aggancio disegnato tra parti e per ogni prova dichiarata nel modello.
 * `boxes`: ingombri delle parti calcolate (servono per gli agganci e per orientare i giunti).
 */
export function planSamples(design: Design, setup: UserSetup, boxes: Record<string, PartBox> = {}): SeriesBuilder[] {
  const fil = new Map(setup.filaments.map((f) => [f.id, f]));
  const partOf = (id: string) => design.parts.find((p) => p.id === id);
  const filOf = (id: string) => fil.get(partOf(id)?.filamentId ?? '') ?? setup.filaments[0];
  const out: SeriesBuilder[] = [];
  if (!setup.filaments.length) return out;

  const size = (j: Joint) => (j.length ?? 10) * (j.radius ?? 5) ** 2;
  const joints = design.joints.filter((j) => (j.type === 'hinge' || j.type === 'rotary') && partOf(j.partA) && partOf(j.partB));
  const pick = (kind: TestKind, list: Joint[], prefer: (j: Joint) => boolean) => {
    const byMat = new Map<string, Joint[]>();
    for (const j of list) byMat.set(filOf(j.partB).material, [...(byMat.get(filOf(j.partB).material) ?? []), j]);
    for (const js of byMat.values()) {
      // Il giunto più piccolo (meno filamento), preferendo quello senza altre funzioni da provare.
      const best = [...js].sort((x, y) => Number(prefer(y)) - Number(prefer(x)) || size(x) - size(y))[0];
      out.push(jointSeries(kind, best, design, setup, filOf(best.partB), boxes));
    }
  };
  pick('hinge', joints.filter((j) => j.type === 'hinge'), (j) => !j.detent?.enabled);
  pick('rotary', joints.filter((j) => j.type === 'rotary'), (j) => !j.detent?.enabled);
  pick('detent', joints.filter((j) => j.detent?.enabled), () => true);

  const conn = design.printPlan.connection;
  if (design.printPlan.strategy === 'separate' && (conn === 'snap' || conn === 'glue'))
    for (const m of materialsToTest(design, setup)) out.push(pegSeries(conn, m.material, m.filament, setup));

  for (const f of fitPairs(design, boxes))
    out.push(fitSeries(`fit:${f.a.id}|${f.b.id}`, t('Aggancio tra «{a}» e «{b}»', { a: f.a.name, b: f.b.name }), t(FIT_HOWTO), [{ part: f.a, box: f.region }, { part: f.b, box: f.region }], filOf(f.a.id), setup));

  for (const s of design.samples ?? []) {
    const regions = s.regions.flatMap((r) => {
      const part = partOf(r.part);
      return part ? [{ part, box: { min: r.min, max: r.max } }] : [];
    });
    if (regions.length) out.push(fitSeries(`sample:${s.id}`, s.name, s.check || t(FIT_HOWTO), regions, filOf(regions[0].part.id), setup));
  }
  return out;
}

/** Prove ancora da fare: giochi non tarati per quel materiale e tutte le prove di misura. */
export function pendingSamples(design: Design, setup: UserSetup, boxes: Record<string, PartBox> = {}): SampleSeries[] {
  return planSamples(design, setup, boxes).filter((s) => s.kind === 'fit' || !isCalibrated(s.material, setup, TEST_KEYS[s.kind]));
}

/** Le prove da stampare: quelle ancora da fare, oppure tutte se è già tutto tarato (richiesta esplicita dalla scheda Stampa). */
export function samplesToPrint(design: Design, setup: UserSetup, boxes: Record<string, PartBox> = {}): SampleSeries[] {
  const todo = pendingSamples(design, setup, boxes);
  return todo.length ? todo : planSamples(design, setup, boxes);
}

export function seriesCoupons(s: SampleSeries): Coupon[] {
  const b = s as SeriesBuilder;
  const values: (number | undefined)[] = s.values ?? [undefined];
  return values.map((value, index) => {
    const r = b.build(index, value);
    return { id: `${s.id}#${index + 1}`, series: s, index, value, material: s.material, design: r.design, tol: r.tol, arrange: r.arrange, size: r.size, drop: r.drop };
  });
}

export interface PlateLayout {
  material: string;
  filament: Filament;
  index: number;
  items: { coupon: Coupon; offset: Vec3 }[];
}

/** Dispone i campioni sui piatti: un materiale per piatto, più piatti se non entrano. */
export function layoutPlates(groups: { material: string; filament: Filament; coupons: Coupon[] }[], bed: Vec3, gap = 8, margin = 12): PlateLayout[] {
  const plates: PlateLayout[] = [];
  for (const g of groups) {
    let plate: PlateLayout = { material: g.material, filament: g.filament, index: 1, items: [] };
    let x = margin, y = margin, rowH = 0;
    for (const c of g.coupons) {
      const [w, h] = c.size;
      if (x + w > bed[0] - margin && x > margin) {
        x = margin;
        y += rowH + gap;
        rowH = 0;
      }
      if (y + h > bed[1] - margin && plate.items.length) {
        plates.push(plate);
        plate = { material: g.material, filament: g.filament, index: plate.index + 1, items: [] };
        x = margin;
        y = margin;
        rowH = 0;
      }
      plate.items.push({ coupon: c, offset: [x, y, 0] });
      x += w + gap;
      rowH = Math.max(rowH, h);
    }
    if (plate.items.length) plates.push(plate);
  }
  return plates;
}

export function readmeText(plates: PlateLayout[]): string {
  const lines: string[] = [
    t('CAMPIONI DI PROVA – Printopus'),
    '================================',
    '',
    t('Sono pezzi del tuo modello ritagliati attorno alle parti incerte.'),
    t('Ogni pezzo porta il nome della parte del modello da cui viene: non sono supporti di stampa.'),
    t('Dove ci sono 3 campioni, i segni (da 1 a 3) indicano il gioco provato.'),
    t('Stampa con lo stesso profilo che userai per il modello (stesso filamento, stessa altezza strato).'),
    '',
  ];
  const byMat = new Map<string, PlateLayout[]>();
  for (const p of plates) byMat.set(p.material, [...(byMat.get(p.material) ?? []), p]);
  for (const [mat, ps] of byMat) {
    lines.push(`--- ${ps.length === 1 ? t('{material} (1 piatto)', { material: mat }) : t('{material} ({n} piatti)', { material: mat, n: ps.length })} ---`);
    const coupons = ps.flatMap((p) => p.items.map((i) => i.coupon));
    for (const s of [...new Map(coupons.map((c) => [c.series.id, c.series])).values()]) {
      lines.push(`${s.name}: ${s.howto}`);
      lines.push(`  ${t('Pezzi: {pieces}', { pieces: s.pieces })}`);
      if (s.sharedPin && s.values?.length) lines.push(`  ${t('Un solo pezzo con il perno: infila sullo stesso perno i pezzi forati, uno alla volta.')}`);
      for (const c of coupons.filter((x) => x.series.id === s.id && x.value !== undefined)) lines.push(`  ${DOT_LABEL(c.index + 1).padEnd(4)} = ${VALUE_LABEL(c.value!)}`);
    }
    lines.push('');
  }
  lines.push(t('Poi apri Printopus → scheda Stampa → Campioni di prova e indica il campione migliore:'));
  lines.push(t('i valori scelti verranno usati per tutti i prossimi modelli con quel materiale.'));
  return lines.join('\n') + '\n';
}
