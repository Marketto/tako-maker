import { describe, expect, it } from 'vitest';
import { evaluateDesign } from '../src/core/geometry/evaluate';
import { analyze } from '../src/core/analysis';
import { applyOps } from '../src/core/design/ops';
import { effectiveStyle, roundShape, sharpBoxes, withStyle } from '../src/core/design/style';
import { printerBlock } from '../src/agent/context';
import type { Design, ShapeNode, StylePrefs, UserSetup } from '../src/core/types';
import { manifold, printer, setup } from './fixtures';

const a1 = printer('bambu-a1');

function design(shape: ShapeNode, extra: Partial<Design> = {}): Design {
  return {
    version: 1,
    name: 'Prova',
    intendedUse: { children: false },
    joints: [],
    parts: [{ id: 'a', name: 'A', filamentId: 'f1', shape }],
    printPlan: { strategy: 'single', connection: 'none' },
    ...extra,
  };
}

const withPrefs = (style?: StylePrefs): UserSetup => ({ ...setup, style });

async function volume(d: Design, s: UserSetup) {
  const w = await manifold();
  return evaluateDesign(w, withStyle(d, s)).parts[0].volume;
}

describe('preferenza di forma', () => {
  it('il progetto prevale sulla preferenza generale', () => {
    const d = design({ op: 'box', size: [10, 10, 10] });
    expect(effectiveStyle(d, withPrefs({ round: true, smooth: true }))).toEqual({ round: true, smooth: true });
    expect(effectiveStyle({ ...d, style: { round: false } }, withPrefs({ round: true, smooth: true }))).toEqual({ round: false, smooth: undefined });
    expect(effectiveStyle(d, withPrefs())).toEqual({ round: undefined, smooth: undefined });
  });

  it('chiede una volta sola se arrotondare, poi se armonizzare', () => {
    const d = design({ op: 'box', size: [20, 20, 20] });
    const q1 = analyze(d, [], withPrefs(), a1, new Set()).questions.find((q) => q.key === 'style:round');
    expect(q1?.options.map((o) => o.prefs)).toEqual([{ round: true }, { round: false, smooth: false }]);
    const q2 = analyze(d, [], withPrefs({ round: true }), a1, new Set()).questions.find((q) => q.key === 'style:smooth');
    expect(q2?.options.map((o) => o.prefs)).toEqual([{ smooth: true }, { smooth: false }]);
    for (const s of [{ round: true, smooth: false }, { round: false, smooth: false }]) {
      expect(analyze(d, [], withPrefs(s), a1, new Set()).questions.some((q) => q.key.startsWith('style:'))).toBe(false);
    }
  });

  it('con l\'arrotondamento attivo non ripete la domanda per i bambini', () => {
    const d = design({ op: 'box', size: [20, 20, 20] }, { intendedUse: { children: true } });
    expect(analyze(d, [], withPrefs({ round: false }), a1, new Set()).questions.some((q) => q.key.startsWith('round:'))).toBe(true);
    expect(analyze(d, [], withPrefs({ round: true, smooth: false }), a1, new Set()).questions.some((q) => q.key.startsWith('round:'))).toBe(false);
  });

  it('set_meta cambia la preferenza solo per il progetto, null la toglie', () => {
    const d = design({ op: 'box', size: [10, 10, 10] });
    const on = applyOps(d, [{ op: 'set_meta', round: false }]);
    expect(on.style).toEqual({ round: false });
    expect(applyOps(on, [{ op: 'set_meta', round: null }]).style).toBeUndefined();
  });

  it('l\'assistente conosce la preferenza', () => {
    expect(printerBlock(withPrefs({ round: true, smooth: true }), a1)).toContain('forme armonizzate: sì');
    expect(printerBlock(withPrefs({ round: false }), a1)).toContain('li vuole vivi');
  });
});

describe('geometria arrotondata', () => {
  it('arrotonda box e cilindri nel calcolo, di più con le forme armonizzate', async () => {
    const d = design({ op: 'union', children: [{ op: 'box', size: [30, 30, 20] }, { op: 'cylinder', h: 20, r: 10, at: [15, 15, 20] }] });
    const sharp = await volume(d, withPrefs({ round: false }));
    const round = await volume(d, withPrefs({ round: true }));
    const smooth = await volume(d, withPrefs({ round: true, smooth: true }));
    expect(round).toBeLessThan(sharp);
    expect(smooth).toBeLessThan(round);
    expect(smooth).toBeGreaterThan(sharp * 0.85);
    // Il disegno salvato non cambia.
    expect(d.parts[0].shape).toEqual(design({ op: 'union', children: [{ op: 'box', size: [30, 30, 20] }, { op: 'cylinder', h: 20, r: 10, at: [15, 15, 20] }] }).parts[0].shape);
  });

  it('il cilindro arrotondato mantiene le misure esterne', async () => {
    const w = await manifold();
    const d = design({ op: 'cylinder', h: 20, r: 10, radius: 3 });
    const p = evaluateDesign(w, d).parts[0];
    expect(p.bbox.max[2] - p.bbox.min[2]).toBeCloseTo(20, 1);
    expect(p.bbox.max[0] - p.bbox.min[0]).toBeCloseTo(20, 0);
    expect(p.volume).toBeLessThan(Math.PI * 100 * 20);
    expect(p.volume).toBeGreaterThan(Math.PI * 100 * 20 * 0.85);
  });

  it('non tocca fori e punte dei coni', () => {
    const hole: ShapeNode = { op: 'cylinder', h: 30, r: 3 };
    const shape: ShapeNode = { op: 'difference', children: [{ op: 'cylinder', h: 10, r: 10 }, hole, { op: 'cylinder', h: 10, r: 5, r2: 0, at: [20, 0, 0] }] };
    const r = roundShape(shape) as ShapeNode & { children: ShapeNode[] };
    expect(sharpBoxes(r)).toBe(0);
    expect(r.children[1]).toEqual(hole);
    expect(roundShape({ op: 'cylinder', h: 10, r: 5, r2: 0 })).toEqual({ op: 'cylinder', h: 10, r: 5, r2: 0 });
  });
});
