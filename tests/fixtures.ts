import Module, { type ManifoldToplevel } from 'manifold-3d';
import printersData from '../src/data/printers.json';
import type { Design, PrinterSpec, UserSetup } from '../src/core/types';

let wasm: ManifoldToplevel | null = null;
export async function manifold(): Promise<ManifoldToplevel> {
  if (!wasm) {
    wasm = await Module();
    wasm.setup();
  }
  return wasm;
}

export const printers = printersData.printers as unknown as PrinterSpec[];
export const printer = (id: string) => printers.find((p) => p.id === id)!;

export const setup: UserSetup = {
  printerId: 'bambu-a1',
  hasMulti: true,
  filaments: [
    { id: 'f1', material: 'PLA', colorName: 'Rosso', hex: '#d63a32' },
    { id: 'f2', material: 'PLA', colorName: 'Giallo', hex: '#f5cf2d' },
    { id: 'f3', material: 'PETG', colorName: 'Bianco', hex: '#f4f4f0' },
  ],
};

/** Portatile giocattolo: base + schermo incernierato, tasti in un altro colore. */
export function toyLaptop(): Design {
  return {
    version: 1,
    name: 'Portatile giocattolo',
    intendedUse: { children: true },
    parts: [
      { id: 'base', name: 'Base', filamentId: 'f3', shape: { op: 'box', size: [160, 110, 12] } },
      {
        id: 'keys',
        name: 'Tastiera',
        filamentId: 'f1',
        shape: { op: 'box', size: [130, 50, 3], at: [15, 15, 12] },
      },
      {
        id: 'screen',
        name: 'Schermo',
        filamentId: 'f2',
        shape: { op: 'box', size: [160, 8, 100], at: [0, 102, 16] },
      },
    ],
    joints: [{ id: 'cerniera', type: 'hinge', partA: 'base', partB: 'screen', axis: 'x', origin: [80, 106, 14], length: 40, radius: 4 }],
    printPlan: { strategy: 'single', connection: 'none' },
  };
}
