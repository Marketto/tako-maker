import type { Tolerances } from '../core/types';
import { msg } from '../i18n';

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

/** Gli archi stampati sopra un foro orizzontale (asse, perno) si abbassano di 0,2-0,4 mm:
    nei fori orizzontali delle parti mobili si aggiunge questo gioco solo verso l'alto. */
export const ARCH_SAG_MM = 0.25;

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
    tips: [msg('Rigido ma fragile: gli incastri a scatto usati spesso possono spezzarsi.'), msg('Si deforma al caldo (sopra i 50 °C circa): non lasciarlo in auto al sole.')],
  },
  'PLA-Silk': {
    nozzleC: [200, 230], bedC: [55, 65], shrinkPct: 0.3, overhangDeg: 45, bridgeMm: 35, tol: {}, goodForSnap: false, warps: false,
    tips: [msg('Bello da vedere ma con strati meno uniti: evitalo per cerniere e incastri.')],
  },
  'PLA-Matte': {
    nozzleC: [200, 230], bedC: [55, 65], shrinkPct: 0.3, overhangDeg: 45, bridgeMm: 40, tol: {}, goodForSnap: false, warps: false,
    tips: [msg('Leggermente più ruvido: le parti mobili possono richiedere un po’ di gioco in più.')],
  },
  PETG: {
    // Due superfici in PETG stampate già montate si saldano sotto 0,6 mm di distanza (0,2 si fonde): gioco minimo 0,6.
    nozzleC: [230, 250], bedC: [75, 85], shrinkPct: 0.4, overhangDeg: 45, bridgeMm: 30, tol: { ...plus(0.05), hingeGap: 0.6 }, goodForSnap: true, warps: false,
    tips: [
      msg('Ottimo per cerniere e incastri: è tenace e un po’ elastico.'),
      msg('Fa qualche filo (stringing): asciuga la bobina se succede spesso.'),
      msg('Sul piatto PEI liscio si attacca troppo: usa la colla stick come distaccante.'),
      msg('Pezzi grandi e piatti: piatto a 80 °C, ventola bassa (10–30%) e spenta nei primi strati, stampante coperta. Così non si imbarcano.'),
      msg('Sul PEI ruvido il brim in PETG si toglie male: meglio le “orecchie” (dischetti sottili agli angoli).'),
      msg('Niente stiratura (ironing): trascina grumi sulla superficie. Meglio la superficie superiore monotonica e lenta.'),
    ],
  },
  ABS: {
    nozzleC: [240, 260], bedC: [90, 110], shrinkPct: 0.7, overhangDeg: 45, bridgeMm: 30, tol: plus(0.05), goodForSnap: true, warps: true,
    tips: [msg('Serve la camera chiusa e una stanza ventilata.'), msg('Usa un brim sui pezzi grandi per evitare che si sollevino gli angoli.'), msg('Ritira circa lo 0,7%: compensa la scala nello slicer per pezzi da incastrare.')],
  },
  ASA: {
    nozzleC: [240, 260], bedC: [90, 110], shrinkPct: 0.6, overhangDeg: 45, bridgeMm: 30, tol: plus(0.05), goodForSnap: true, warps: true,
    tips: [msg('Come l’ABS ma resiste al sole: ideale per l’esterno.'), msg('Camera chiusa e brim sui pezzi grandi.')],
  },
  TPU: {
    nozzleC: [210, 230], bedC: [30, 60], shrinkPct: 0.2, overhangDeg: 40, bridgeMm: 15,
    tol: { hingeGap: 0.5, pinClearance: 0.45, detentClearance: 0.3, pegSnap: 0, pegGlue: 0.3 }, goodForSnap: false, warps: false,
    tips: [msg('Stampa lenta, meglio con estrusore diretto.'), msg('Non va nei sistemi multicolore standard: stampalo come parte separata.'), msg('È flessibile: perfetto per paracolpi e parti morbide, non per cerniere rigide.')],
  },
  PA: {
    nozzleC: [250, 280], bedC: [70, 90], shrinkPct: 1, overhangDeg: 40, bridgeMm: 25, tol: plus(0.1), goodForSnap: true, warps: true,
    tips: [msg('Assorbe umidità: essicca la bobina prima di stampare.'), msg('Camera chiusa consigliata; ritiro alto (circa 1%).')],
  },
  PC: {
    nozzleC: [260, 300], bedC: [100, 120], shrinkPct: 0.6, overhangDeg: 40, bridgeMm: 25, tol: plus(0.05), goodForSnap: true, warps: true,
    tips: [msg('Molto resistente ma difficile: camera chiusa, piatto caldo e brim.')],
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

/* ---------- Supporti e adesione al piatto ---------- */

/** Sotto questa area d'appoggio (mm²) un pezzo può staccarsi dal piatto durante la stampa. */
export const MIN_CONTACT_MM2 = 40;
/** Un pezzo più alto di questo multiplo del lato d'appoggio è instabile (snello). */
export const MAX_SLENDERNESS = 6;
/** Sporgenze oltre questa area (mm²) richiedono supporti. */
export const SUPPORT_MIN_AREA_MM2 = 15;
/** PLA e PETG nello stesso piatto: temperature dentro la finestra comune (PETG 220-250, PLA 190-230). */
export const MIXED_PLA_PETG_C = { PETG: 230, PLA: 225 };
/** Pezzo "grande e piatto" (rischio di angoli sollevati): area d'appoggio e altezza massima. */
export const LARGE_FLAT_MM2 = 8000;
export const LARGE_FLAT_MAX_H = 25;
/** Brim consigliato per fissare pezzi piccoli o snelli (mm). */
export const SMALL_PART_BRIM_MM = 5;

/** Coppie di materiali che si staccano facilmente l'uno dall'altro: ottime come interfaccia dei supporti. */
const SUPPORT_PARTNER: Record<string, string> = { PLA: 'PETG', PETG: 'PLA' };

/**
 * Materiale da usare per l'interfaccia dei supporti di un pezzo: quello "opposto" tra PLA e PETG,
 * se l'utente lo possiede (non aderisce al pezzo, quindi i supporti si staccano puliti).
 *
 * Attenzione ai pezzi in PETG con supporti in PLA su stampanti a ugello singolo (es. Kobra X, AMS):
 * negli strati in cui si alternano i due materiali l'ugello scende alla temperatura del PLA e il
 * PETG vicino si salda male tra strato e strato, diventando fragile (si divide). In quel caso il
 * PLA si usa solo con più ugelli, ognuno alla sua temperatura.
 */
export function supportInterfaceFor(material: string, available: string[], multiNozzle = false): string | undefined {
  const fam = family(material);
  const partner = SUPPORT_PARTNER[fam];
  if (!partner) return undefined;
  if (fam === 'PETG' && !multiNozzle) return undefined;
  return available.find((m) => family(m) === partner);
}

/** true se il PLA nei supporti indebolirebbe un pezzo in PETG (ugello singolo). */
export function plaSupportWeakensPetg(material: string, available: string[], multiNozzle: boolean): boolean {
  return family(material) === 'PETG' && !multiNozzle && available.some((m) => family(m) === 'PLA');
}
