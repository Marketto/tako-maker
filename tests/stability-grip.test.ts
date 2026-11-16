import { describe, expect, it } from 'vitest';
import { evaluateDesign } from '../src/core/geometry/evaluate';
import { analyze } from '../src/core/analysis';
import { stability } from '../src/core/analysis/stability';
import { applyOps, DesignError } from '../src/core/design/ops';
import type { Design } from '../src/core/types';
import { manifold, printer, setup } from './fixtures';

/** Lampada: piede e stelo; con `lean` il braccio sporge molto oltre il piede. */
function lamp(lean: number, intendedUse: Design['intendedUse'] = { children: false }): Design {
  return {
    version: 1,
    name: 'Lampada',
    intendedUse,
    parts: [
      {
        id: 'lampada',
        name: 'Lampada',
        shape: {
          op: 'union',
          children: [
            { op: 'cylinder', h: 5, r: 20 },
            { op: 'cylinder', h: 100, r: 4, at: [0, 0, 5] },
            { op: 'box', size: [lean, 30, 20], at: [0, -15, 100] },
          ],
        },
      },
    ],
    joints: [],
    printPlan: { strategy: 'single', connection: 'none' },
  };
}

async function report(d: Design) {
  const w = await manifold();
  const r = evaluateDesign(w, d);
  return analyze(d, r.parts, setup, printer('bambu-a1'), new Set(), r);
}

describe('baricentro', () => {
  it('calcola baricentro e margine di una base larga', async () => {
    const w = await manifold();
    const r = evaluateDesign(w, lamp(10));
    const st = stability(r.parts, () => 1.24)!;
    expect(st.marginMm).toBeGreaterThan(5);
    expect(st.tipDeg).toBeGreaterThan(10);
  });

  it('modello che cade: chiede se deve stare in piedi, con la richiesta per l\'assistente', async () => {
    const rep = await report(lamp(90));
    const q = rep.questions.find((x) => x.key === 'rests')!;
    expect(q).toBeDefined();
    expect(q.detail).toMatch(/cade/);
    expect(q.options[0].ops).toEqual([{ op: 'set_meta', rests: true }]);
    expect(q.options[0].action).toBe('ask_ai');
    expect(q.options[0].prompt).toMatch(/allarga la base/);
    expect(q.options[1].ops).toEqual([{ op: 'set_meta', rests: false }]);
  });

  it('se deve stare appoggiato avvisa; se si tiene in mano non dice niente', async () => {
    const yes = await report(lamp(90, { children: false, rests: true }));
    expect(yes.questions.some((x) => x.key === 'rests')).toBe(false);
    expect(yes.warnings.join(' ')).toMatch(/il modello cade/);
    const no = await report(lamp(90, { children: false, rests: false }));
    expect(no.warnings.join(' ')).not.toMatch(/il modello cade/);
  });

  it('modello stabile: nessuna domanda', async () => {
    const rep = await report(lamp(10));
    expect(rep.questions.some((x) => x.key === 'rests')).toBe(false);
  });
});

describe('impugnature', () => {
  const lever = (patch: Partial<Design['intendedUse']> = {}, ergonomic?: boolean): Design => ({
    ...lamp(10, { children: false, rests: false, ...patch }),
    parts: [{ id: 'leva', name: 'Leva', grip: ergonomic === undefined ? {} : { ergonomic }, shape: { op: 'box', size: [20, 20, 100] } }],
  });

  it('chiede se renderla ergonomica, poi per chi, con le misure per l\'assistente', async () => {
    const q1 = (await report(lever())).questions.find((x) => x.key.startsWith('grip:'))!;
    expect(q1.text).toMatch(/«Leva» si impugna/);
    expect(q1.options[0].ops).toEqual([{ op: 'update_part', id: 'leva', grip: { ergonomic: true } }]);
    expect(q1.options[0].action).toBeUndefined();
    const rep2 = await report(lever({}, true));
    expect(rep2.questions.some((x) => x.key.startsWith('grip:'))).toBe(false);
    const q2 = rep2.questions.find((x) => x.key === 'hand')!;
    expect(q2.options.map((o) => o.id)).toEqual(['man', 'woman', 'teen', 'child', 'toddler']);
    const woman = q2.options.find((o) => o.id === 'woman')!;
    expect(woman.ops).toEqual([{ op: 'set_meta', hand: 'woman' }]);
    expect(woman.prompt).toMatch(/30–35 mm/);
  });

  it('con la mano già nota la risposta sì va subito all\'assistente; per i bambini solo le età giovani', async () => {
    const q = (await report(lever({ hand: 'child' }))).questions.find((x) => x.key.startsWith('grip:'))!;
    expect(q.options[0].action).toBe('ask_ai');
    expect(q.options[0].prompt).toMatch(/22–28 mm/);
    const kids = (await report(lever({ children: true }, true))).questions.find((x) => x.key === 'hand')!;
    expect(kids.options.map((o) => o.id)).toEqual(['teen', 'child', 'toddler']);
  });

  it('valida grip e hand', () => {
    const d = lamp(10);
    expect(applyOps(d, [{ op: 'update_part', id: 'lampada', grip: {} }, { op: 'set_meta', hand: 'teen', rests: true }]).intendedUse).toMatchObject({ hand: 'teen', rests: true });
    expect(() => applyOps(d, [{ op: 'set_meta', hand: 'giant' as never }])).toThrow(DesignError);
  });
});
