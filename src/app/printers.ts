import printersData from '../data/printers.json';
import type { PrinterSpec, UserSetup } from '../core/types';
import { t } from '../i18n';

/* Elenco delle stampanti (src/data/printers.json) e stampante dell'utente. */

export const PRINTERS = printersData.printers as unknown as PrinterSpec[];
export const printerById = (id: string) => PRINTERS.find((p) => p.id === id) ?? PRINTERS.find((p) => p.id === 'custom')!;

/** Stampante dell'utente, con le caratteristiche indicate a mano se è personalizzata. */
export function printerOf(setup: UserSetup): PrinterSpec {
  const p = printerById(setup.printerId);
  const c = setup.custom;
  if (p.id !== 'custom' || !c) return p;
  return {
    ...p,
    enclosed: c.enclosed,
    kinematics: c.kinematics,
    multi: c.multiSlots > 1 ? { system: t('sistema multicolore'), slots: c.multiSlots, optional: false, purgeMm3: 400, changeS: 50 } : null,
  };
}
