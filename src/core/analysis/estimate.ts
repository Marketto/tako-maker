import type { Filament, PrinterSpec, PrintStrategy, UserSetup, Vec3 } from '../types';
import { material } from '../../data/materials';
import { msg, t } from '../../i18n';

/* Stime volutamente semplici e trasparenti (vedi docs/ANALISI.md).
   Servono a confrontare le strategie tra loro, non a sostituire lo slicer. */

export const EST = {
  /** Frazione del volume pieno effettivamente estrusa (pareti + ~15% riempimento). */
  massFactor: 0.35,
  /** Utilizzo medio del flusso massimo della stampante. */
  flowUtilization: 0.5,
  layerHeight: 0.2,
  /** Riscaldamento, calibrazione, rimozione piatto. */
  plateOverheadS: 300,
  /** Cambio manuale della bobina tra un piatto e l'altro. */
  manualSwapS: 120,
  /** Pausa per cambio colore manuale a una certa quota (utente presente). */
  layerSwapS: 180,
  layerSwapWasteMm3: 300,
};

export interface PartStat {
  id: string;
  filamentId?: string;
  volume: number;
  bbox: { min: Vec3; max: Vec3 };
  contactBox?: { min: Vec3; max: Vec3 };
}

export interface StrategyEstimate {
  strategy: PrintStrategy;
  feasible: boolean;
  reason?: string;
  timeS: number;
  filamentG: number;
  wasteG: number;
  plates: number;
  colorChanges: number;
  needsAssembly: boolean;
  score: number;
}

function grams(volMm3: number, f?: Filament): number {
  const density = material(f?.material ?? 'PLA').density;
  return (volMm3 / 1000) * density;
}

function extrudeTimeS(volMm3: number, p: PrinterSpec): number {
  return (volMm3 * EST.massFactor) / (p.flowMm3s * EST.flowUtilization);
}

export function bedOf(setup: UserSetup, p: PrinterSpec): Vec3 {
  return setup.customBed ?? p.bed;
}

export function fitsBed(size: Vec3, bed: Vec3): boolean {
  // Consente la rotazione di 90° sul piano.
  const [x, y, z] = size;
  return z <= bed[2] && ((x <= bed[0] && y <= bed[1]) || (y <= bed[0] && x <= bed[1]));
}

const sizeOf = (b: { min: Vec3; max: Vec3 }): Vec3 => [b.max[0] - b.min[0], b.max[1] - b.min[1], b.max[2] - b.min[2]];

function unionBox(parts: PartStat[]): { min: Vec3; max: Vec3 } {
  const min: Vec3 = [Infinity, Infinity, Infinity];
  const max: Vec3 = [-Infinity, -Infinity, -Infinity];
  for (const p of parts)
    for (let k = 0; k < 3; k++) {
      min[k] = Math.min(min[k], p.bbox.min[k]);
      max[k] = Math.max(max[k], p.bbox.max[k]);
    }
  return { min, max };
}

/** Intervalli Z occupati da ciascun filamento (montato, senza separare le parti). */
function zRanges(parts: PartStat[]): Map<string, [number, number][]> {
  const m = new Map<string, [number, number][]>();
  for (const p of parts) {
    const k = p.filamentId ?? '_';
    m.set(k, [...(m.get(k) ?? []), [p.bbox.min[2], p.bbox.max[2]]]);
  }
  return m;
}

export function colorChangesPerPrint(parts: PartStat[]): number {
  if (!parts.length) return 0;
  const ranges = zRanges(parts);
  const box = unionBox(parts);
  let changes = 0;
  for (let z = box.min[2] + EST.layerHeight / 2; z < box.max[2]; z += EST.layerHeight) {
    let c = 0;
    for (const rs of ranges.values()) if (rs.some(([a, b]) => z >= a && z <= b)) c++;
    changes += Math.max(0, c - 1);
  }
  return changes;
}

/** I colori sono "a strati": ogni filamento occupa una fascia Z distinta. */
export function isZStratified(parts: PartStat[], tol = 0.3): boolean {
  const bands = [...zRanges(parts).values()].map((rs) => [Math.min(...rs.map((r) => r[0])), Math.max(...rs.map((r) => r[1]))] as [number, number]);
  bands.sort((a, b) => a[0] - b[0]);
  for (let i = 1; i < bands.length; i++) if (bands[i][0] < bands[i - 1][1] - tol) return false;
  return true;
}

/**
 * @param linked coppie di parti unite da articolazioni stampate già montate:
 *               non possono essere stampate separatamente con colori diversi.
 */
export function estimateStrategies(parts: PartStat[], setup: UserSetup, printer: PrinterSpec, linked: [string, string][] = []): StrategyEstimate[] {
  const fil = new Map(setup.filaments.map((f) => [f.id, f]));
  const usedIds = [...new Set(parts.map((p) => p.filamentId ?? '_'))];
  const k = usedIds.length;
  const bed = bedOf(setup, printer);
  const totalVol = parts.reduce((s, p) => s + p.volume, 0);
  const totalG = parts.reduce((s, p) => s + grams(p.volume * EST.massFactor, fil.get(p.filamentId ?? '')), 0);
  const baseTime = extrudeTimeS(totalVol, printer) + EST.plateOverheadS;
  const assembledFits = parts.length ? fitsBed(sizeOf(unionBox(parts)), bed) : true;
  const avgDensityG = (mm3: number) => grams(mm3, setup.filaments.find((f) => usedIds.includes(f.id)));
  const out: StrategyEstimate[] = [];

  const mk = (e: Omit<StrategyEstimate, 'score'>): StrategyEstimate => {
    const assembly = e.needsAssembly ? 0.15 * Math.max(0, parts.length - 1) : 0;
    const attention = e.strategy === 'layer-swap' ? 0.1 * Math.max(0, k - 1) : 0;
    return { ...e, score: e.feasible ? e.timeS / 3600 + e.wasteG / 20 + assembly + attention : Infinity };
  };

  if (k <= 1) {
    out.push(mk({ strategy: 'single', feasible: assembledFits, reason: assembledFits ? undefined : t('Il modello montato non entra nel piatto'), timeS: baseTime, filamentG: totalG, wasteG: 0, plates: 1, colorChanges: 0, needsAssembly: false }));
  }

  // Multicolore in un'unica stampa
  {
    const multi = printer.multi;
    let reason: string | undefined;
    if (k <= 1) reason = t('Un solo colore');
    else if (!multi) reason = t('La stampante non ha un sistema multicolore');
    else if (!setup.hasMulti) reason = t('Non hai indicato di avere {system}', { system: multi.system });
    else if (k > multi.slots) reason = t('Servono {k} colori, {system} ne gestisce {slots}', { k, system: multi.system, slots: multi.slots });
    else if (usedIds.some((id) => fil.get(id) && !material(fil.get(id)!.material).multiFriendly)) reason = t('Uno dei materiali non è adatto al sistema multicolore');
    else if (!assembledFits) reason = t('Il modello montato non entra nel piatto');
    const changes = colorChangesPerPrint(parts);
    const purge = multi ? changes * multi.purgeMm3 : 0;
    out.push(mk({ strategy: 'multicolor', feasible: !reason, reason, timeS: baseTime + changes * (multi?.changeS ?? 0), filamentG: totalG, wasteG: avgDensityG(purge), plates: 1, colorChanges: changes, needsAssembly: false }));
  }

  // Cambio colore manuale a quota (solo se i colori sono a fasce)
  if (k > 1) {
    const ok = isZStratified(parts) && assembledFits;
    out.push(mk({ strategy: 'layer-swap', feasible: ok, reason: ok ? undefined : t('I colori non sono a fasce orizzontali'), timeS: baseTime + (k - 1) * EST.layerSwapS, filamentG: totalG, wasteG: avgDensityG((k - 1) * EST.layerSwapWasteMm3), plates: 1, colorChanges: k - 1, needsAssembly: false }));
  }

  // Parti separate, un piatto per colore (più piatti se non entrano)
  if (parts.length > 1) {
    let plates = 0;
    let reason: string | undefined;
    for (const id of usedIds) {
      const group = parts.filter((p) => (p.filamentId ?? '_') === id);
      const area = group.reduce((s, p) => {
        const sz = sizeOf(p.bbox);
        return s + (sz[0] + 5) * (sz[1] + 5);
      }, 0);
      plates += Math.max(1, Math.ceil(area / (bed[0] * bed[1] * 0.7)));
      if (group.some((p) => !fitsBed(sizeOf(p.bbox), bed))) reason = t('Almeno una parte non entra nel piatto');
    }
    const fil = (id: string) => parts.find((p) => p.id === id)?.filamentId;
    if (linked.some(([a, b]) => fil(a) !== fil(b))) reason = t('Una cerniera stampata già montata unisce parti di colori diversi');
    const time = extrudeTimeS(totalVol, printer) + plates * EST.plateOverheadS + (plates - 1) * EST.manualSwapS;
    out.push(mk({ strategy: 'separate', feasible: !reason, reason, timeS: time, filamentG: totalG, wasteG: 0, plates, colorChanges: 0, needsAssembly: true }));
  }

  return out.sort((a, b) => a.score - b.score);
}

export const STRATEGY_LABEL: Record<PrintStrategy, string> = {
  single: msg('stampa unica, un colore'),
  multicolor: msg('stampa multicolore unica'),
  separate: msg('parti separate da assemblare'),
  'layer-swap': msg('cambio colore manuale a quota'),
};

export function fmtTime(s: number): string {
  const h = Math.floor(s / 3600);
  const m = Math.round((s % 3600) / 60);
  return h ? t('{h} h {m} min', { h, m }) : t('{m} min', { m });
}
