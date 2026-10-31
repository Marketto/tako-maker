import type { Tolerances } from '../core/types';

/* Linee guida di stampa per materiale. Valori indicativi e prudenti, raccolti dalle
   pratiche comuni: l'etichetta della bobina e il profilo dello slicer hanno la precedenza.
   Usati da: analisi (avvisi e consigli), tolleranze di default, istruzioni all'AI. */

export interface MaterialGuideline {
  /** Temperatura ugello / piatto indicative (°C). */
  nozzleC: [number, number];
  bedC: [number, number];
  /** Ritiro tipico in XY (%), da compensare nello slicer se > 0,4. */
  shrinkPct: number;
  /** Angolo di sbalzo massimo senza supporti (gradi dalla verticale). */
  overhangDeg: number;
  /** Ponte massimo affidabile senza supporti (mm). */
  bridgeMm: number;
  /** Delta sulle tolleranze di base (mm). */
  tol: Partial<Tolerances>;
  /** Adatto a incastri a scatto ripetuti e cerniere. */
  goodForSnap: boolean;
  /** Pezzi con base grande tendono a sollevarsi agli angoli. */
  warps: boolean;
  tips: string[];
}

export const BASE_TOLERANCES: Tolerances = {
  hingeGap: 0.4,
  pinClearance: 0.35,
  detentClearance: 0.25,
  pegSnap: 0.1,
  pegGlue: 0.3,
};

const plus = (d: number): Partial<Tolerances> => ({
  hingeGap: BASE_TOLERANCES.hingeGap + d,
  pinClearance: BASE_TOLERANCES.pinClearance + d,
  detentClearance: BASE_TOLERANCES.detentClearance + d,
  pegSnap: BASE_TOLERANCES.pegSnap + d,
  pegGlue: BASE_TOLERANCES.pegGlue + d,
});

export const GUIDELINES: Record<string, MaterialGuideline> = {
  PLA: {
    nozzleC: [190, 220], bedC: [50, 65], shrinkPct: 0.3, overhangDeg: 50, bridgeMm: 50, tol: {}, goodForSnap: false, warps: false,
    tips: ['Rigido ma fragile: gli incastri a scatto usati spesso possono spezzarsi.', 'Si deforma al caldo (sopra i 50 °C circa): non lasciarlo in auto al sole.'],
  },
  'PLA-Silk': {
    nozzleC: [200, 230], bedC: [55, 65], shrinkPct: 0.3, overhangDeg: 45, bridgeMm: 35, tol: {}, goodForSnap: false, warps: false,
    tips: ['Bello da vedere ma con strati meno uniti: evitalo per cerniere e incastri.'],
  },
  'PLA-Matte': {
    nozzleC: [200, 230], bedC: [55, 65], shrinkPct: 0.3, overhangDeg: 45, bridgeMm: 40, tol: {}, goodForSnap: false, warps: false,
    tips: ['Leggermente più ruvido: le parti mobili possono richiedere un po’ di gioco in più.'],
  },
  PETG: {
    nozzleC: [230, 250], bedC: [70, 85], shrinkPct: 0.4, overhangDeg: 45, bridgeMm: 30, tol: plus(0.05), goodForSnap: true, warps: false,
    tips: ['Ottimo per cerniere e incastri: è tenace e un po’ elastico.', 'Fa qualche filo (stringing): asciuga la bobina se succede spesso.', 'Sul piatto PEI liscio si attacca troppo: usa la colla stick come distaccante.'],
  },
  ABS: {
    nozzleC: [240, 260], bedC: [90, 110], shrinkPct: 0.7, overhangDeg: 45, bridgeMm: 30, tol: plus(0.05), goodForSnap: true, warps: true,
    tips: ['Serve la camera chiusa e una stanza ventilata.', 'Usa un brim sui pezzi grandi per evitare che si sollevino gli angoli.', 'Ritira circa lo 0,7%: compensa la scala nello slicer per pezzi da incastrare.'],
  },
  ASA: {
    nozzleC: [240, 260], bedC: [90, 110], shrinkPct: 0.6, overhangDeg: 45, bridgeMm: 30, tol: plus(0.05), goodForSnap: true, warps: true,
    tips: ['Come l’ABS ma resiste al sole: ideale per l’esterno.', 'Camera chiusa e brim sui pezzi grandi.'],
  },
  TPU: {
    nozzleC: [210, 230], bedC: [30, 60], shrinkPct: 0.2, overhangDeg: 40, bridgeMm: 15,
    tol: { hingeGap: 0.5, pinClearance: 0.45, detentClearance: 0.3, pegSnap: 0, pegGlue: 0.3 }, goodForSnap: false, warps: false,
    tips: ['Stampa lenta, meglio con estrusore diretto.', 'Non va nei sistemi multicolore standard: stampalo come parte separata.', 'È flessibile: perfetto per paracolpi e parti morbide, non per cerniere rigide.'],
  },
  PA: {
    nozzleC: [250, 280], bedC: [70, 90], shrinkPct: 1, overhangDeg: 40, bridgeMm: 25, tol: plus(0.1), goodForSnap: true, warps: true,
    tips: ['Assorbe umidità: essicca la bobina prima di stampare.', 'Camera chiusa consigliata; ritiro alto (circa 1%).'],
  },
  PC: {
    nozzleC: [260, 300], bedC: [100, 120], shrinkPct: 0.6, overhangDeg: 40, bridgeMm: 25, tol: plus(0.05), goodForSnap: true, warps: true,
    tips: ['Molto resistente ma difficile: camera chiusa, piatto caldo e brim.'],
  },
};

export function guideline(material: string): MaterialGuideline {
  return GUIDELINES[material] ?? GUIDELINES.PLA;
}

/** Spessore minimo di parete consigliato: 3 linee di estrusione (2,4 mm per giocattoli). */
export function minWall(nozzle: number, forChildren: boolean): number {
  const line = nozzle * 1.125;
  return Math.round(Math.max(3 * line, forChildren ? 2.4 : 1.2) * 10) / 10;
}

/** Coppie di materiali che aderiscono male tra loro se stampate a contatto. */
export const POOR_BOND: [string, string][] = [
  ['PLA', 'PETG'],
  ['PLA', 'ABS'],
  ['PLA', 'ASA'],
  ['PETG', 'ABS'],
  ['PETG', 'ASA'],
  ['PLA', 'PA'],
  ['PLA', 'PC'],
];

const family = (m: string) => (m.startsWith('PLA') ? 'PLA' : m);

export function bondsPoorly(a: string, b: string): boolean {
  const fa = family(a);
  const fb = family(b);
  if (fa === fb) return false;
  return POOR_BOND.some(([x, y]) => (x === fa && y === fb) || (x === fb && y === fa));
}
