import { describe, expect, it } from 'vitest';
import { unzipSync, strFromU8 } from 'fflate';
import { applyOps, DesignError } from '../src/core/design/ops';
import { evaluateDesign } from '../src/core/geometry/evaluate';
import { analyze } from '../src/core/analysis';
import { planAssembly } from '../src/core/assembly/plan';
import { shoppingListText } from '../src/core/hardware';
import { buildSTLZip } from '../src/core/export/stl';
import { manifold, printer, setup, toyLaptop } from './fixtures';
import type { Design, Hardware } from '../src/core/types';

const magnets: Hardware = { id: 'magneti', name: 'Magnete al neodimio', qty: 4, spec: '6×2 mm', purpose: 'chiusura del coperchio' };
const withMagnets = (extra: Partial<Hardware> = {}): Design => applyOps(toyLaptop(), [{ op: 'add_hardware', item: { ...magnets, ...extra } }]);

async function questionsFor(d: Design, answered = new Set<string>()) {
  const w = await manifold();
  return analyze(d, evaluateDesign(w, d).parts, setup, printer('bambu-a1'), answered);
}

describe('elementi da comprare a parte', () => {
  it("l'AI li dichiara ma non può decidere al posto dell'utente", () => {
    const d = withMagnets({ decision: 'buy' });
    expect(d.hardware).toHaveLength(1);
    expect(d.hardware![0].decision).toBeUndefined();
    expect(() => applyOps(d, [{ op: 'add_hardware', item: magnets }])).toThrow(DesignError);
    expect(() => applyOps(toyLaptop(), [{ op: 'add_hardware', item: { ...magnets, qty: 0 } }])).toThrow(/quantità/);
  });

  it('chiede conferma per ogni elemento, con alternativa stampata', async () => {
    const d = applyOps(withMagnets(), [{ op: 'add_hardware', item: { id: 'viti', name: 'Vite', qty: 2, spec: 'M3×10' } }]);
    const qs = (await questionsFor(d)).questions.filter((q) => q.key.startsWith('hardware:'));
    expect(qs).toHaveLength(2);
    expect(qs[0].text).toMatch(/4 × Magnete al neodimio \(6×2 mm\)/);
    const printed = qs[0].options.find((o) => o.id === 'printed')!;
    expect(printed.action).toBe('ask_ai');
    expect(printed.prompt).toMatch(/chiusura del coperchio/);
    const bought = applyOps(d, qs[0].options.find((o) => o.id === 'buy')!.ops!);
    expect(bought.hardware![0].decision).toBe('buy');
    expect((await questionsFor(bought)).questions.filter((q) => q.key.startsWith('hardware:'))).toHaveLength(1);
  });

  it('se cambia cosa comprare, richiede di nuovo la conferma', () => {
    const d = applyOps(withMagnets(), [{ op: 'update_hardware', id: 'magneti', patch: { decision: 'buy' } }]);
    const d2 = applyOps(d, [{ op: 'update_hardware', id: 'magneti', patch: { qty: 6 } }]);
    expect(d2.hardware![0].decision).toBeUndefined();
  });

  it("avvisa finché l'alternativa stampata non sostituisce l'elemento", async () => {
    const d = applyOps(withMagnets(), [{ op: 'update_hardware', id: 'magneti', patch: { decision: 'printed' } }]);
    const r = await questionsFor(d);
    expect(r.questions.some((q) => q.key.startsWith('hardware:'))).toBe(false);
    expect(r.warnings.some((w) => /soluzione stampata/.test(w))).toBe(true);
    expect(shoppingListText(d)).toBeUndefined();
  });

  it('per i bambini avvisa sugli elementi piccoli', async () => {
    const d = applyOps(withMagnets(), [{ op: 'set_meta', children: true }]);
    expect((await questionsFor(d)).warnings.some((w) => /Magneti/.test(w))).toBe(true);
  });

  it('lista della spesa nella guida di montaggio e nei file esportati', () => {
    const d = withMagnets();
    const plan = planAssembly(d, [
      { id: 'base', box: { min: [0, 0, 0], max: [100, 60, 10] } },
      { id: 'screen', box: { min: [0, 60, 0], max: [100, 70, 60] } },
    ]);
    expect(plan.steps[0].tips.join(' ')).toMatch(/Tieni a portata di mano: 4 × Magnete/);
    const zip = unzipSync(buildSTLZip([], undefined, { 'DA-ACQUISTARE.txt': shoppingListText(d)! }));
    expect(strFromU8(zip['DA-ACQUISTARE.txt'])).toMatch(/- 4 × Magnete al neodimio \(6×2 mm\) — chiusura del coperchio/);
  });
});

describe("strumento edit_design e scelte dell'utente", () => {
  it("toglie decision dalle operazioni dell'AI", async () => {
    const { runTool } = await import('../src/agent/tools');
    const w = await manifold();
    let current = applyOps(withMagnets(), []);
    const env = {
      design: () => current,
      commit: (d: Design) => void (current = d),
      setup,
      printer: printer('bambu-a1'),
      evaluate: async (d: Design) => ({ parts: evaluateDesign(w, d).parts, errors: [] as string[] }),
      analyze: (d: Design, parts: Parameters<typeof analyze>[1]) => analyze(d, parts, setup, printer('bambu-a1'), new Set()),
    };
    const out = await runTool('edit_design', { ops: [{ op: 'update_hardware', id: 'magneti', patch: { decision: 'buy', spec: '8×3 mm' } }] }, env as never);
    expect(out.kind).toBe('result');
    expect(current.hardware![0].spec).toBe('8×3 mm');
    expect(current.hardware![0].decision).toBeUndefined();
  });
});
