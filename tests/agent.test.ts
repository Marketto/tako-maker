import { describe, expect, it } from 'vitest';
import { routeByRules } from '../src/agent/router';
import { SKILLS } from '../src/agent/skills';
import { Budget, costOf, type KV } from '../src/agent/budget';
import { KeyRouter } from '../src/agent/providers/keyRouter';
import { PROVIDERS } from '../src/agent/config';
import { runAgent, resumeAgent } from '../src/agent/runner';
import type { ToolEnv } from '../src/agent/tools';
import { evaluateDesign } from '../src/core/geometry/evaluate';
import { analyze } from '../src/core/analysis';
import { emptyDesign, type Design } from '../src/core/types';
import { manifold, printer, setup, toyLaptop } from './fixtures';

const memKV = (): KV => {
  const m = new Map<string, string>();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v) };
};

describe('skill', () => {
  it('carica tutte le skill dai SKILL.md', () => {
    expect(Object.keys(SKILLS).sort()).toEqual(['cerca-modelli', 'consiglia-stampa', 'crea-modello', 'modifica-modello', 'spiega']);
    expect(SKILLS['cerca-modelli'].tools).toEqual(['web_search', 'show_results']);
    expect(SKILLS['crea-modello'].tier).toBe('smart');
  });
});

describe('router a regole', () => {
  const o = { searchFirst: true };
  it('primo messaggio → ricerca, e rileva i bambini', () => {
    const r = routeByRules('vorrei un portatile per far giocare una bambina', null, o);
    expect(r.skill).toBe('cerca-modelli');
    expect(r.hints.children).toBe(true);
  });
  it('con un modello aperto → modifica o consigli', () => {
    const d = toyLaptop();
    expect(routeByRules('rendi lo schermo più grande', d, o).skill).toBe('modifica-modello');
    expect(routeByRules('quanto tempo ci vuole a stamparlo?', d, o).skill).toBe('consiglia-stampa');
    expect(routeByRules('cerca altri modelli simili', d, o).skill).toBe('cerca-modelli');
    expect(routeByRules('che cos’è il PETG?', d, o).skill).toBe('consiglia-stampa');
  });
});

describe('costi', () => {
  it('calcola costi con cache e ricerche', () => {
    const c = costOf(PROVIDERS.anthropic.models.fast.price, { input_tokens: 1_000_000, output_tokens: 0, cache_read_input_tokens: 1_000_000, server_tool_use: { web_search_requests: 2 } });
    expect(c).toBeCloseTo(0.1 + 0.01 + 0.02, 6);
  });
  it('blocca oltre il tetto mensile', () => {
    const b = new Budget(memKV(), 0.001);
    b.record(PROVIDERS.anthropic.models.smart.price, { input_tokens: 1000, output_tokens: 1000 });
    expect(b.canSpend()).toBe(false);
  });
});

describe('ciclo agente (API simulata)', () => {
  async function env(start: Design): Promise<ToolEnv & { current: Design }> {
    const w = await manifold();
    const e = {
      current: start,
      design: () => e.current,
      commit: (d: Design) => void (e.current = d),
      setup,
      printer: printer('bambu-a1'),
      evaluate: async (d: Design) => {
        const r = evaluateDesign(w, d);
        return { parts: r.parts, errors: r.errors };
      },
      analyze: (d: Design, parts: Parameters<typeof analyze>[1]) => analyze(d, parts, setup, printer('bambu-a1'), new Set()),
    };
    return e;
  }

  function fakeFetch(responses: unknown[], seen: unknown[]): typeof fetch {
    return (async (_url: string, init: RequestInit) => {
      seen.push(JSON.parse(String(init.body)));
      const body = responses.shift();
      return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
    }) as unknown as typeof fetch;
  }

  const usage = { input_tokens: 100, output_tokens: 50 };

  it('esegue edit_design e restituisce il testo finale', async () => {
    const e = await env(emptyDesign());
    const seen: unknown[] = [];
    const client = new KeyRouter(() => [{ id: 'k1', provider: 'anthropic', label: 'Test', key: 'test', enabled: true }], memKV(), new Budget(memKV(), 10), fakeFetch([
      { id: '1', stop_reason: 'tool_use', usage, content: [{ type: 'tool_use', id: 't1', name: 'edit_design', input: { ops: [{ op: 'add_part', part: { id: 'cubo', name: 'Cubo', filamentId: 'f1', shape: { op: 'box', size: [20, 20, 20] } } }] } }] },
      { id: '2', stop_reason: 'end_turn', usage, content: [{ type: 'text', text: 'Ho creato un cubo rosso.' }] },
    ], seen));
    const out = await runAgent({ skill: SKILLS['crea-modello'], text: 'un cubo', history: [], env: e, client, economy: false, meshes: [] });
    expect(out.text).toBe('Ho creato un cubo rosso.');
    expect(e.current.parts).toHaveLength(1);
    const second = seen[1] as { messages: { content: { type: string; content: string }[] }[]; system: { cache_control?: unknown }[] };
    expect(second.messages.at(-1)!.content[0].content).toMatch(/^OK\. Parti: cubo/);
    expect(second.system.at(-1)!.cache_control).toEqual({ type: 'ephemeral' });
  });

  it('si mette in pausa su ask_user e riprende', async () => {
    const e = await env(emptyDesign());
    const client = new KeyRouter(() => [{ id: 'k1', provider: 'anthropic', label: 'Test', key: 'test', enabled: true }], memKV(), new Budget(memKV(), 10), fakeFetch([
      { id: '1', stop_reason: 'tool_use', usage, content: [{ type: 'tool_use', id: 'q1', name: 'ask_user', input: { question: 'Grande o piccolo?', options: [{ id: 'g', label: 'Grande' }, { id: 'p', label: 'Piccolo' }] } }] },
      { id: '2', stop_reason: 'end_turn', usage, content: [{ type: 'text', text: 'Va bene, piccolo.' }] },
    ], []));
    const base = { skill: SKILLS['crea-modello'], env: e, client, economy: false, meshes: [] };
    const out = await runAgent({ ...base, text: 'un cubo', history: [] });
    expect(out.question?.options).toHaveLength(2);
    const done = await resumeAgent(base, out.state!, 'Piccolo');
    expect(done.text).toBe('Va bene, piccolo.');
  });

  it('restituisce un errore all’AI se le operazioni non sono valide', async () => {
    const e = await env(emptyDesign());
    const seen: unknown[] = [];
    const client = new KeyRouter(() => [{ id: 'k1', provider: 'anthropic', label: 'Test', key: 'test', enabled: true }], memKV(), new Budget(memKV(), 10), fakeFetch([
      { id: '1', stop_reason: 'tool_use', usage, content: [{ type: 'tool_use', id: 't1', name: 'edit_design', input: { ops: [{ op: 'add_part', part: { id: 'x', name: 'X', filamentId: 'inesistente', shape: { op: 'box', size: [1, 1, 1] } } }] } }] },
      { id: '2', stop_reason: 'end_turn', usage, content: [{ type: 'text', text: 'ok' }] },
    ], seen));
    await runAgent({ skill: SKILLS['crea-modello'], text: 'x', history: [], env: e, client, economy: true, meshes: [] });
    const r = (seen[1] as { messages: { content: { is_error?: boolean }[] }[] }).messages.at(-1)!.content[0];
    expect(r.is_error).toBe(true);
    expect(e.current.parts).toHaveLength(0);
    expect((seen[0] as { model: string }).model).toBe('claude-haiku-5-5');
  });
});
