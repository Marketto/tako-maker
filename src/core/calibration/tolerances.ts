import type { Design, Tolerances, UserSetup } from '../types';
import { BASE_TOLERANCES, guideline } from '../../data/guidelines';

/* Tolleranze effettive per materiale:
   base → delta del materiale (linee guida) → valori calibrati dall'utente con i campioni. */

export function tolerancesFor(material: string, setup?: Pick<UserSetup, 'tolerances'>): Tolerances {
  return { ...BASE_TOLERANCES, ...guideline(material).tol, ...(setup?.tolerances?.[material] ?? {}) };
}

export function isCalibrated(material: string, setup: Pick<UserSetup, 'tolerances'>, keys: (keyof Tolerances)[]): boolean {
  const t = setup.tolerances?.[material];
  return !!t && keys.every((k) => typeof t[k] === 'number');
}

/** Tolleranze per ogni parte, in base al materiale del suo filamento. */
export function tolerancesByPart(design: Design, setup: UserSetup): Record<string, Tolerances> {
  const fil = new Map(setup.filaments.map((f) => [f.id, f.material]));
  return Object.fromEntries(design.parts.map((p) => [p.id, tolerancesFor(fil.get(p.filamentId ?? '') ?? 'PLA', setup)]));
}
