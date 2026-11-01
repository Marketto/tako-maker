import type { Design } from '../types';

/** Coppie di parti stampate già montate tra loro (cerniere, perni rotanti, pulsanti nel guscio):
    devono uscire dallo stesso piatto. */
export function printedTogether(d: Design): [string, string][] {
  return [
    ...d.joints.filter((j) => j.type !== 'slider').map((j) => [j.partA, j.partB] as [string, string]),
    ...d.parts.filter((p) => p.button).map((p) => [p.button!.housing, p.id] as [string, string]),
  ];
}

export const pairKey = (a: string, b: string) => [a, b].sort().join('|');
