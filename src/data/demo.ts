import type { Design, Filament } from '../core/types';

/** Modello d'esempio (portatile giocattolo) per provare l'app senza chiave API. */
export function demoDesign(filaments: Filament[]): Design {
  const f = (i: number) => filaments[i % Math.max(1, filaments.length)]?.id;
  return {
    version: 1,
    name: 'Esempio: portatile giocattolo',
    description: 'Base con tastiera in rilievo e schermo incernierato.',
    intendedUse: { children: true },
    parts: [
      { id: 'base', name: 'Base', filamentId: f(0), shape: { op: 'box', size: [150, 100, 12] } },
      {
        id: 'tasti',
        name: 'Tastiera',
        filamentId: f(1),
        shape: {
          op: 'union',
          at: [15, 14, 12],
          children: [0, 1, 2].flatMap((r) => [0, 1, 2, 3, 4, 5, 6].map((c) => ({ op: 'box' as const, size: [14, 12, 3] as [number, number, number], at: [c * 17, r * 15, 0] as [number, number, number] }))),
        },
      },
      {
        id: 'schermo',
        name: 'Schermo',
        filamentId: f(2),
        shape: {
          op: 'difference',
          at: [0, 92, 16],
          children: [
            { op: 'box', size: [150, 8, 95] },
            { op: 'box', size: [126, 3, 70], at: [12, -1, 14] },
          ],
        },
      },
      { id: 'display', name: 'Display', filamentId: f(3), shape: { op: 'box', size: [126, 2, 70], at: [12, 91, 30] } },
    ],
    joints: [{ id: 'cerniera', type: 'hinge', partA: 'base', partB: 'schermo', axis: 'x', origin: [75, 96, 14], length: 40, radius: 4 }],
    printPlan: { strategy: 'single', connection: 'none' },
  };
}
