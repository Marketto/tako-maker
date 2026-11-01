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
  | (NodeBase & { op: 'cylinder'; h: number; r: number; r2?: number; center?: boolean; segments?: number })
  | (NodeBase & { op: 'sphere'; r: number })
  | (NodeBase & { op: 'mesh'; ref: string; scale?: number })
  | (NodeBase & { op: 'union' | 'difference' | 'intersection' | 'hull'; children: ShapeNode[] });

export interface Part {
  id: string;
  name: string;
  filamentId?: string;
  shape: ShapeNode;
}

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
  detent?: { enabled: boolean; anglesDeg?: number[] };
}

export type PrintStrategy = 'single' | 'multicolor' | 'separate' | 'layer-swap';
export type Connection = 'glue' | 'snap' | 'none';

export interface Attribution {
  title: string;
  url: string;
  author?: string;
  license: string;
}

export interface Design {
  version: 1;
  name: string;
  description?: string;
  intendedUse: { children: boolean; notes?: string };
  source?: Attribution & { kind: 'remix' | 'inspiration' };
  parts: Part[];
  joints: Joint[];
  printPlan: {
    strategy: PrintStrategy;
    connection: Connection;
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
  action?: 'calibration';
}

export interface Question {
  id: string;
  /** Chiave stabile: la stessa domanda non viene riproposta se già risposta. */
  key: string;
  text: string;
  detail?: string;
  options: QuestionOption[];
  multi?: boolean;
  /** Applicate prima delle opzioni scelte (es. "disattiva tutti gli scatti"). */
  baseOps?: DesignOp[];
  source: 'analysis' | 'agent';
}
