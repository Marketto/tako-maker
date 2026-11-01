import { describe, expect, it } from 'vitest';
import { BUTTON, buttonDepthNeeded, evaluateDesign, PEG_SPACING } from '../src/core/geometry/evaluate';
import { analyze } from '../src/core/analysis';
import { applyOps } from '../src/core/design/ops';
import { planAssembly } from '../src/core/assembly/plan';
import { runTool } from '../src/agent/tools';
import type { Design, ShapeNode } from '../src/core/types';
import { manifold, printer, setup } from './fixtures';

/** Scatola cava lunga in due metà, pareti spesse: bordo di contatto lungo. */
function longBox(len: number): Design {
  const shell = (h: number, z: number, openTop: boolean): ShapeNode => ({
    op: 'difference',
    at: [0, 0, z],
    children: [
      { op: 'box', size: [len, 40, h] },
      { op: 'box', size: [len - 16, 24, h], at: [8, 8, openTop ? 3 : -3] },
    ],
  });
  return {
    version: 1, name: 'Astuccio', intendedUse: { children: false }, joints: [],
    parts: [
      { id: 'fondo', name: 'Fondo', filamentId: 'f1', shape: shell(20, 0, true) },
      { id: 'coperchio', name: 'Coperchio', filamentId: 'f1', shape: shell(10, 20, false) },
    ],
    printPlan: { strategy: 'separate', connection: 'snap' },
  };
}

function remote(button: Record<string, unknown> = { housing: 'corpo' }, round = true): Design {
  return {
    version: 1, name: 'Telecomando', intendedUse: { children: false }, joints: [],
    parts: [
      { id: 'corpo', name: 'Corpo', filamentId: 'f1', shape: { op: 'box', size: [60, 40, 14] } },
      {
        id: 'tasto', name: 'Tasto', filamentId: 'f1',
        shape: round ? { op: 'cylinder', h: 2, r: 6, at: [30, 20, 14] } : { op: 'box', size: [14, 10, 2], at: [23, 15, 14] },
        button: button as never,
      },
    ],
    printPlan: { strategy: 'single', connection: 'none' },
  };
}

describe('ganci intermedi sui bordi lunghi', () => {
  it('su un bordo lungo mette perni intermedi, non solo agli estremi', async () => {
    const w = await manifold();
    const short = evaluateDesign(w, longBox(60)).connectors[0];
    const long = evaluateDesign(w, longBox(240)).connectors[0];
    expect(long.pegs).toBeGreaterThan(short.pegs);
    expect(long.pegs).toBeGreaterThanOrEqual(Math.ceil((2 * 240) / PEG_SPACING.snap) - 2);
    expect(long.maxSpanMm!).toBeLessThanOrEqual(PEG_SPACING.snap * 1.5);
  });
});

describe('pulsanti', () => {
  it('genera tasto, foro e lamella e rispetta la sporgenza scelta', async () => {
    const w = await manifold();
    for (const round of [true, false]) {
      const r = evaluateDesign(w, remote({ housing: 'corpo', protrusionMm: 2, feel: 'soft' }, round));
      expect(r.errors).toEqual([]);
      expect(r.buttons[0].ok).toBe(true);
      const tasto = r.parts.find((p) => p.id === 'tasto')!;
      expect(tasto.bbox.max[2]).toBeCloseTo(16, 1);
      // Il gambo e la flangia scendono dentro il guscio
      expect(tasto.bbox.min[2]).toBeLessThan(14 - BUTTON.skin);
      const plain = evaluateDesign(w, { ...remote(), parts: [remote().parts[0]] }).parts[0];
      expect(r.parts[0].volume).toBeLessThan(plain.volume);
    }
  });

  it('con il click aggiunge i dentini e accorcia la corsa', async () => {
    const w = await manifold();
    const soft = evaluateDesign(w, remote({ housing: 'corpo', protrusionMm: 2, feel: 'soft' }));
    const click = evaluateDesign(w, remote({ housing: 'corpo', protrusionMm: 2, feel: 'click' }));
    expect(click.buttons[0].travel).toBeLessThan(soft.buttons[0].travel);
    expect(click.parts[1].volume).toBeGreaterThan(soft.parts[1].volume);
  });

  it('segnala un guscio troppo sottile', async () => {
    const w = await manifold();
    const d = remote();
    d.parts[0].shape = { op: 'box', size: [60, 40, 4] };
    (d.parts[1].shape as { at: number[] }).at = [30, 20, 4];
    const r = evaluateDesign(w, d);
    expect(r.buttons[0].ok).toBe(false);
    const rep = analyze(d, r.parts, setup, printer('bambu-a1'), new Set(), r);
    expect(rep.warnings.join(' ')).toMatch(/il guscio è troppo sottile: servono almeno/);
    expect(buttonDepthNeeded('soft', 0.4)).toBeGreaterThan(4);
  });

  it('chiede sporgenza e click, senza token', async () => {
    const w = await manifold();
    const d = { ...remote(), intendedUse: { children: true } };
    const r = evaluateDesign(w, d);
    const qs = analyze(d, r.parts, setup, printer('bambu-a1'), new Set(), r).questions;
    const prot = qs.find((q) => q.key.startsWith('button-prot'))!;
    const feel = qs.find((q) => q.key.startsWith('button-feel'))!;
    expect(prot.detail).toMatch(/almeno 2 mm/);
    expect(feel.options.map((o) => o.id)).toEqual(['click', 'soft']);
    const d2 = applyOps(applyOps(d, prot.options[1].ops!), feel.options[0].ops!);
    expect(d2.parts[1].button).toEqual({ housing: 'corpo', protrusionMm: 2, feel: 'click' });
    const qs2 = analyze(d2, evaluateDesign(w, d2).parts, setup, printer('bambu-a1'), new Set()).questions;
    expect(qs2.some((q) => q.key.startsWith('button-'))).toBe(false);
  });

  it("l'AI non può scegliere sporgenza e click al posto dell'utente", async () => {
    const w = await manifold();
    let current: Design = { ...remote(), parts: [remote().parts[0]] };
    const env = {
      design: () => current,
      commit: (d: Design) => void (current = d),
      setup,
      printer: printer('bambu-a1'),
      evaluate: async (d: Design) => ({ parts: evaluateDesign(w, d).parts, errors: [] as string[] }),
      analyze: (d: Design, parts: Parameters<typeof analyze>[1]) => analyze(d, parts, setup, printer('bambu-a1'), new Set()),
    };
    await runTool('edit_design', { ops: [{ op: 'add_part', part: { ...remote().parts[1], button: { housing: 'corpo', protrusionMm: 3, feel: 'click' } } }] }, env as never);
    expect(current.parts[1].button).toEqual({ housing: 'corpo' });
  });

  it('valida il guscio e la guida di montaggio lo dà già montato', () => {
    expect(() => applyOps(remote(), [{ op: 'update_part', id: 'tasto', button: { housing: 'tasto' } }])).toThrow(/housing/);
    const d = { ...remote(), printPlan: { strategy: 'separate' as const, connection: 'none' as const } };
    const plan = planAssembly(d, [
      { id: 'corpo', box: { min: [0, 0, 0], max: [60, 40, 14] } },
      { id: 'tasto', box: { min: [24, 14, 14], max: [36, 26, 16] } },
    ]);
    expect(plan.steps[1].text).toMatch(/già montato/);
    expect(plan.steps[1].distance).toBe(0);
  });
});
