import type { Design, Joint, RotaryPrint } from '../types';

/** Scelta di stampa dei perni rotanti decisa dall'app (vedi `chooseRotaryPrint` in geometry/evaluate.ts). */
export type JointModes = Record<string, RotaryPrint>;

/** Come si stampa davvero un giunto: il perno a scatto vale solo con le parti separate,
    altrimenti il pezzo esce già montato. */
export function jointPrint(d: Design, j: Joint, modes: JointModes = {}): RotaryPrint | 'loose' {
  if (j.type !== 'rotary') return 'in-place';
  const wanted = j.print ?? modes[j.id] ?? 'in-place';
  return wanted !== 'in-place' && d.printPlan.strategy === 'separate' ? wanted : 'in-place';
}

/** Coppie di parti stampate già montate tra loro (cerniere, perni rotanti, pulsanti nel guscio):
    devono uscire dallo stesso piatto. I perni rotanti a scatto (o lisci) no: i due pezzi si stampano separati. */
export function printedTogether(d: Design, modes: JointModes = {}): [string, string][] {
  return [
    ...d.joints.filter((j) => j.type !== 'slider' && jointPrint(d, j, modes) === 'in-place').map((j) => [j.partA, j.partB] as [string, string]),
    ...d.parts.filter((p) => p.button).map((p) => [p.button!.housing, p.id] as [string, string]),
  ];
}

/** Perni rotanti che conviene stampare in due pezzi da montare a scatto (scelta dell'utente o dell'app). */
export function prefersSnap(d: Design, modes: JointModes = {}): Joint[] {
  return d.joints.filter((j) => j.type === 'rotary' && (j.print ?? modes[j.id]) === 'snap');
}

export const pairKey = (a: string, b: string) => [a, b].sort().join('|');
