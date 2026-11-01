import type { Design, Filament, Part, ShapeNode, Tolerances, UserSetup, Vec3 } from '../types';
import { tolerancesFor } from './tolerances';

/* Campioni di prova per tarare giochi e tolleranze sulla propria stampante.
   Ogni serie ha 5 campioni con valori centrati sul consigliato per il materiale;
   il numero di puntini in rilievo (1–5) identifica il campione dopo la stampa. */

export type TestKind = 'hinge' | 'detent' | 'snap' | 'glue';

export const TEST_LABEL: Record<TestKind, string> = {
  hinge: 'Cerniera (gioco)',
  detent: 'Scatto',
  snap: 'Incastro a pressione',
  glue: 'Perno da incollare',
};

export const TEST_HOWTO: Record<TestKind, string> = {
  hinge: 'Muovi le cerniere: scegli il gioco più piccolo che si sblocca e gira liscio.',
  detent: 'Scegli lo scatto più netto che si muove ancora senza forzare troppo.',
  snap: 'Inserisci i perni: scegli quello che entra premendo con decisione e poi non si sfila da solo.',
  glue: 'Scegli il perno che entra a mano senza forzare, con il minimo gioco.',
};

const OFFSETS = [-0.1, -0.05, 0, 0.05, 0.1];
const r2 = (v: number) => Math.round(v * 100) / 100;

/** Quale tolleranza modifica ciascun test. */
export function applyTestValue(kind: TestKind, v: number): Partial<Tolerances> {
  switch (kind) {
    case 'hinge':
      return { hingeGap: v, pinClearance: r2(Math.max(0.1, v - 0.05)) };
    case 'detent':
      return { detentClearance: v };
    case 'snap':
      return { pegSnap: v };
    case 'glue':
      return { pegGlue: v };
  }
}

export function centerValue(kind: TestKind, t: Tolerances): number {
  return kind === 'hinge' ? t.hingeGap : kind === 'detent' ? t.detentClearance : kind === 'snap' ? t.pegSnap : t.pegGlue;
}

export function testValues(kind: TestKind, material: string): number[] {
  // Centrati sul valore consigliato per il materiale (non su quello già calibrato,
  // così ripetere la prova esplora sempre lo stesso intervallo ragionevole).
  const c = centerValue(kind, tolerancesFor(material));
  return OFFSETS.map((o) => r2(Math.max(0, c + o)));
}

export const TEST_KEYS: Record<TestKind, (keyof Tolerances)[]> = {
  hinge: ['hingeGap', 'pinClearance'],
  detent: ['detentClearance'],
  snap: ['pegSnap'],
  glue: ['pegGlue'],
};

/** Prove utili per il modello corrente. */
export function neededTests(design: Design): TestKind[] {
  const out: TestKind[] = [];
  const articulated = design.joints.filter((j) => j.type === 'hinge' || j.type === 'rotary');
  if (articulated.length) out.push('hinge');
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
  const out = new Map<string, Filament>();
  for (const p of design.parts) {
    if (!ids.has(p.id)) continue;
    const f = fil.get(p.filamentId ?? '') ?? setup.filaments[0];
    if (f && !out.has(f.material)) out.set(f.material, f);
  }
  return [...out].map(([material, filament]) => ({ material, filament }));
}

export interface Coupon {
  id: string;
  kind: TestKind;
  index: number;
  value: number;
  material: string;
  design: Design;
  tol: Tolerances;
  size: [number, number];
}

const box = (size: Vec3, at?: Vec3, radius = 0.6): ShapeNode => ({ op: 'box', size, at, radius });

function dots(n: number, z: number, x0 = 3, y0 = 3): ShapeNode[] {
  return Array.from({ length: n }, (_, k) => ({ op: 'sphere', r: 1, at: [x0 + k * 3.4, y0, z] }) as ShapeNode);
}

const VALUE_LABEL = (v: number) => `${v.toFixed(2).replace('.', ',')} mm`;
const DOT_LABEL = (n: number) => '●'.repeat(n);

function couponDesign(name: string, parts: Part[], joints: Design['joints'] = []): Design {
  return { version: 1, name, intendedUse: { children: false }, parts, joints, printPlan: { strategy: 'separate', connection: 'none' } };
}

export function buildCoupons(kind: TestKind, material: string, filament: Filament, setup: UserSetup): Coupon[] {
  const base = tolerancesFor(material, setup);
  return testValues(kind, material).map((value, index) => {
    const n = index + 1;
    const tol: Tolerances = { ...base, ...applyTestValue(kind, value) };
    const tag = `${TEST_LABEL[kind]} ${VALUE_LABEL(value)} ${DOT_LABEL(n)}`;
    const id = `${material}-${kind}-${n}`;
    if (kind === 'hinge' || kind === 'detent') {
      const R = 3.5;
      const parts: Part[] = [
        { id: 'a', name: `${tag} – A`, filamentId: filament.id, shape: { op: 'union', children: [box([24, 13, 4]), ...dots(n, 4)] } },
        { id: 'b', name: `${tag} – B`, filamentId: filament.id, shape: box([24, 13, 4], [0, 18, 0]) },
      ];
      const joint = {
        id: 'j',
        type: 'hinge' as const,
        partA: 'a',
        partB: 'b',
        axis: 'x' as const,
        origin: [12, 15.5, R] as Vec3,
        length: 24,
        radius: R,
        detent: kind === 'detent' ? { enabled: true, anglesDeg: [0, 90, 180] } : { enabled: false },
      };
      return { id, kind, index, value, material, design: couponDesign(tag, parts, [joint]), tol, size: [24, 31] };
    }
    // Perno (A) e blocco con foro (B), da stampare affiancati
    const clearance = value;
    const parts: Part[] = [
      {
        id: 'a',
        name: `${tag} – perno`,
        filamentId: filament.id,
        shape: { op: 'union', children: [box([16, 16, 5]), { op: 'cylinder', h: 5, r: 2.5, at: [8, 8, 4] }, ...dots(n, 5)] },
      },
      {
        id: 'b',
        name: `${tag} – foro`,
        filamentId: filament.id,
        shape: { op: 'difference', children: [box([16, 16, 6], [22, 0, 0]), { op: 'cylinder', h: 4.6, r: 2.5 + clearance, at: [30, 8, -0.01] }, ...dots(n, 6, 25, 3)] },
      },
    ];
    return { id, kind, index, value, material, design: couponDesign(tag, parts), tol, size: [38, 16] };
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

export function readmeText(plates: PlateLayout[], kinds: TestKind[]): string {
  const lines: string[] = [
    'CAMPIONI DI PROVA – Tako Maker',
    '================================',
    '',
    'Ogni campione ha da 1 a 5 puntini in rilievo: il numero di puntini indica il valore provato.',
    'Stampa con lo stesso profilo che userai per il modello (stesso filamento, stessa altezza strato).',
    '',
  ];
  const byMat = new Map<string, PlateLayout[]>();
  for (const p of plates) byMat.set(p.material, [...(byMat.get(p.material) ?? []), p]);
  for (const [mat, ps] of byMat) {
    lines.push(`--- ${mat} (${ps.length} piatt${ps.length === 1 ? 'o' : 'i'}) ---`);
    for (const k of kinds) {
      const cs = ps.flatMap((p) => p.items.map((i) => i.coupon)).filter((c) => c.kind === k);
      if (!cs.length) continue;
      lines.push(`${TEST_LABEL[k]}: ${TEST_HOWTO[k]}`);
      for (const c of cs) lines.push(`  ${DOT_LABEL(c.index + 1).padEnd(6)} = ${VALUE_LABEL(c.value)}`);
    }
    lines.push('');
  }
  lines.push('Poi apri Tako Maker → scheda Stampa → Campioni di prova e indica il campione migliore:');
  lines.push('i valori scelti verranno usati per tutti i prossimi modelli con quel materiale.');
  return lines.join('\n') + '\n';
}
