/* Tipi condivisi. Il "Design" è il documento JSON che descrive il modello:
   l'AI non genera mai mesh, modifica solo questo documento con operazioni
   piccole (vedi core/design/ops.ts). Specifica: docs/DESIGN-DSL.md */

import type { DesignOp } from './design/ops';
import { t } from '../i18n';

export type Vec3 = [number, number, number];

export interface MultiMaterialSystem {
  system: string;
  slots: number;
  optional: boolean;
  purgeMm3: number;
  changeS: number;
  /** Più ugelli, ognuno alla propria temperatura (doppio ugello, cambio utensile). */
  multiNozzle?: boolean;
  /** Torre di spurgo predefinita dello slicer (angolo anteriore sinistro, mm); null = nessuna torre; assente = valori della famiglia di slicer. */
  tower?: { x: number; y: number; w: number; d: number; brim: number } | null;
}

export interface PrinterSpec {
  id: string;
  brand: string;
  model: string;
  bed: Vec3;
  enclosed: boolean;
  flowMm3s: number;
  slicer: string;
  multi: MultiMaterialSystem | null;
  /** corexy: piatto fermo in XY; bedslinger: il piatto si muove avanti/indietro (Y). */
  kinematics?: 'corexy' | 'bedslinger';
  /** Diametro ugello di serie (mm). */
  nozzle?: number;
  /** Passo tra i piatti nel progetto dello slicer (Bambu Studio e derivati), misurato su un file reale. */
  plateStride?: [number, number];
  /** Nomi dei profili nello slicer (Bambu Studio e derivati): servono perché il 3MF si apra come progetto con i suoi piatti. */
  slicerProfile?: SlicerProfile;
}

/** Profili di sistema dello slicer per la stampante, come compaiono in un progetto salvato. */
export interface SlicerProfile {
  /** Prefisso delle intestazioni di slice_info.config (es. "X-ACNext" per Anycubic Slicer Next). */
  client: string;
  printerModel: string;
  /** Profilo stampante (es. "Anycubic Kobra X 0.4 nozzle"). */
  printer: string;
  /** Profilo di stampa (processo). */
  print: string;
  /** Profilo filamento: {material} diventa il materiale (es. "Anycubic {material} @Anycubic Kobra X 0.4 nozzle"). */
  filament: string;
  bedType?: string;
}

/** Giochi e tolleranze usati per cerniere, scatti e perni (mm). */
export interface Tolerances {
  hingeGap: number;
  pinClearance: number;
  detentClearance: number;
  pegSnap: number;
  pegGlue: number;
}

export interface Filament {
  id: string;
  material: string; // es. "PLA"
  colorName: string; // es. "Rosso"
  hex: string;
}

export interface UserSetup {
  printerId: string;
  /** Override per stampante personalizzata o volume diverso. */
  customBed?: Vec3;
  /** L'utente possiede il sistema multicolore (AMS, MMU...). */
  hasMulti: boolean;
  filaments: Filament[];
  /** Diametro ugello montato (default: quello della stampante, 0,4 mm). */
  nozzle?: number;
  /** Tolleranze calibrate con i campioni di prova, per materiale (es. "PLA"). */
  tolerances?: Record<string, Partial<Tolerances>>;
  /** Caratteristiche della stampante personalizzata (printerId "custom"). */
  custom?: { enclosed: boolean; kinematics: 'corexy' | 'bedslinger'; multiSlots: number };
  /** Preferenze di forma per tutti i progetti (chieste una volta sola). */
  style?: StylePrefs;
}

/** Come rifinire le forme. `undefined` = non ancora chiesto. */
export interface StylePrefs {
  /** Arrotonda angoli e spigoli vivi esterni. */
  round?: boolean;
  /** Armonizza le forme: raggi più ampi e forme più morbide (vale solo con `round`). */
  smooth?: boolean;
}

/* ---------- Design DSL ---------- */

interface NodeBase {
  /** Traslazione in mm. */
  at?: Vec3;
  /** Rotazione in gradi (X, Y, Z). */
  rot?: Vec3;
}

export type ShapeNode =
  | (NodeBase & { op: 'box'; size: Vec3; radius?: number; center?: boolean })
  | (NodeBase & { op: 'cylinder'; h: number; r: number; r2?: number; radius?: number; center?: boolean; segments?: number })
  | (NodeBase & { op: 'sphere'; r: number })
  | (NodeBase & { op: 'mesh'; ref: string; scale?: number })
  | (NodeBase & { op: 'union' | 'difference' | 'intersection' | 'hull'; children: ShapeNode[] });

/** Pulsante stampato già montato nel suo guscio: la meccanica la genera l'app. */
export interface ButtonSpec {
  /** Parte in cui è inserito il pulsante. */
  housing: string;
  /** Quanto sporge dalla superficie (mm). Lo sceglie l'utente. */
  protrusionMm?: number;
  /** Risposta alla pressione. La sceglie l'utente. */
  feel?: 'click' | 'soft';
}

export interface Part {
  id: string;
  name: string;
  filamentId?: string;
  shape: ShapeNode;
  /** Se presente, la parte è un pulsante: la forma indica solo l'impronta del tasto. */
  button?: ButtonSpec;
  /** La parte (o una sua zona) si impugna: maniglia, manico, leva. `ergonomic` lo sceglie l'utente (domanda dell'app). */
  grip?: { ergonomic?: boolean };
}

/** Per chi è pensata l'impugnatura (misure della mano in `HAND_GRIP`, src/data/guidelines.ts). */
export type HandSize = 'man' | 'woman' | 'teen' | 'child' | 'toddler';

export type JointType = 'hinge' | 'slider' | 'rotary';

export interface Joint {
  id: string;
  type: JointType;
  /** Parte fissa e parte mobile. */
  partA: string;
  partB: string;
  axis: 'x' | 'y' | 'z';
  origin: Vec3;
  /** Lunghezza della cerniera lungo l'asse (mm). */
  length?: number;
  /** Raggio esterno delle nocche (mm). */
  radius?: number;
  /** undefined = l'utente non ha ancora scelto. */
  /** Scatti: `anglesDeg` = posizioni di B, in gradi dalla posizione disegnata, positivi in senso antiorario
      guardando dalla punta dell'asse (+x, +y o +z). La posizione disegnata (0) scatta sempre. */
  detent?: { enabled: boolean; anglesDeg?: number[] };
  /** Solo `rotary`: `in-place` stampato già montato, `snap` due pezzi da montare con il perno a scatto;
      undefined = sceglie l'app (quello con meno supporti). `loose` (solo per i campioni di prova):
      perno liscio senza fermo, i due pezzi si infilano a mano. */
  print?: RotaryPrint | 'loose';
}

export type RotaryPrint = 'in-place' | 'snap';

export type PrintStrategy = 'single' | 'multicolor' | 'separate' | 'layer-swap';
/** `none`: non ancora deciso (l'app chiede); `designed`: aggancio disegnato nel modello, l'app non aggiunge perni. */
export type Connection = 'glue' | 'snap' | 'none' | 'designed';

export interface Attribution {
  title: string;
  url: string;
  author?: string;
  license: string;
}

/** Elemento non stampabile da comprare a parte (vite, magnete, molla, cuscinetto…). */
export interface Hardware {
  id: string;
  /** Nome comune, es. "Magnete al neodimio". */
  name: string;
  qty: number;
  /** Misure o tipo, es. "6×2 mm", "M3×10". */
  spec?: string;
  /** A cosa serve nel modello. */
  purpose?: string;
  /** Scelta dell'utente: undefined = da chiedere, 'buy' = lo compra, 'printed' = sostituirlo con una soluzione stampata. */
  decision?: 'buy' | 'printed';
}

/** Prova di misura: pezzi ritagliati dal modello, da stampare per controllare un accoppiamento
    che l'app non vede da sola (un oggetto esterno da calzare, due copie dello stesso pezzo da agganciare…). */
export interface Sample {
  id: string;
  name: string;
  /** Cosa controllare dopo la stampa. */
  check?: string;
  /** Zone da ritagliare (coordinate del modello, mm): ogni zona diventa un pezzo. */
  regions: { part: string; min: Vec3; max: Vec3 }[];
}

export interface Design {
  version: 1;
  name: string;
  description?: string;
  /** `rests`: si usa appoggiato su un piano (true) o tenuto in mano / appeso (false); serve al controllo del baricentro.
      `hand`: per chi è pensata l'impugnatura. */
  /** `fitsOnto`: oggetto esistente su cui il modello si aggancia o calza (es. «sponda del letto Ikea Malm»). */
  intendedUse: { children: boolean; notes?: string; rests?: boolean; hand?: HandSize; fitsOnto?: string };
  /** Rifinitura delle forme solo per questo progetto; se manca vale la preferenza generale (`UserSetup.style`). */
  style?: StylePrefs;
  source?: Attribution & { kind: 'remix' | 'inspiration' };
  parts: Part[];
  joints: Joint[];
  /** Elementi da comprare a parte. */
  hardware?: Hardware[];
  /** Prove di misura da stampare prima del modello (zone delle parti da ritagliare). */
  samples?: Sample[];
  printPlan: {
    strategy: PrintStrategy;
    connection: Connection;
    /** Come appoggiare sul piatto: per `*` (modello montato) o per id di parte, la direzione del disegno che va verso il piatto. Se manca, la sceglie l'app. */
    orient?: Record<string, Vec3>;
  };
}

export function emptyDesign(name = t('Nuovo modello')): Design {
  return {
    version: 1,
    name,
    intendedUse: { children: false },
    parts: [],
    joints: [],
    printPlan: { strategy: 'single', connection: 'none' },
  };
}

/* ---------- Domande all'utente (generate da analisi locali o dall'AI) ---------- */

export interface QuestionOption {
  id: string;
  label: string;
  hint?: string;
  /** Modifiche applicate localmente se l'utente sceglie questa opzione (zero token). */
  ops?: DesignOp[];
  /** Azione locale aggiuntiva (es. generare i campioni di prova). */
  action?: 'calibration' | 'ask_ai';
  /** Con action 'ask_ai': richiesta inviata all'assistente. */
  prompt?: string;
  /** Preferenze di forma da salvare per tutti i progetti. */
  prefs?: StylePrefs;
}

export interface Question {
  id: string;
  /** Chiave stabile: la stessa domanda non viene riproposta se già risposta. */
  key: string;
  text: string;
  detail?: string;
  options: QuestionOption[];
  multi?: boolean;
  /** L'utente può scrivere la risposta (misure, modello esatto…). */
  freeText?: boolean;
  /** Applicate prima delle opzioni scelte (es. "disattiva tutti gli scatti"). */
  baseOps?: DesignOp[];
  source: 'analysis' | 'agent' | 'manual';
}
