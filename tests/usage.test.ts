import { describe, expect, it } from 'vitest';
import { Budget, diffTally, estimateTokens, tokensOf, type KV } from '../src/agent/budget';
import { handleRpc, SETUP_TOKENS, type ConnectorStore } from '../src/connector/server';
import { newCode, type ConnectorState } from '../src/connector/state';
import { emptyDesign } from '../src/core/types';
import { manifold, printer, setup } from './fixtures';

const memKV = (): KV => {
  const m = new Map<string, string>();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v) };
};

describe('consumo di token', () => {
  it('stima i token dalla lunghezza del testo', () => {
    expect(estimateTokens('')).toBe(0);
    expect(estimateTokens('a'.repeat(35))).toBe(10);
  });

  it('conta input, cache e output di una risposta API', () => {
    expect(tokensOf({ input_tokens: 10, output_tokens: 5, cache_creation_input_tokens: 100, cache_read_input_tokens: 1000 })).toEqual({ input: 1110, output: 5 });
  });

  it('differenza tra conteggi cumulativi, anche quando il connettore riparte da zero', () => {
    expect(diffTally({ calls: 3, inputTokens: 300, outputTokens: 30 }, { calls: 1, inputTokens: 100, outputTokens: 10 })).toEqual({ calls: 2, inputTokens: 200, outputTokens: 20 });
    expect(diffTally({ calls: 1, inputTokens: 50, outputTokens: 5 }, { calls: 4, inputTokens: 400, outputTokens: 40 })).toEqual({ calls: 1, inputTokens: 50, outputTokens: 5 });
    expect(diffTally({ calls: 1, inputTokens: 50, outputTokens: 5 }, undefined)).toEqual({ calls: 1, inputTokens: 50, outputTokens: 5 });
  });

  it('il riepilogo del mese somma le stime senza toccare la spesa in dollari', () => {
    const b = new Budget(memKV(), 5);
    b.recordEstimate('manual', { calls: 1, inputTokens: 1000, outputTokens: 200 });
    b.recordEstimate('manual', { calls: 1, inputTokens: 500, outputTokens: 100 });
    b.recordEstimate('connector', { calls: 0, inputTokens: 0, outputTokens: 0 });
    const r = b.current();
    expect(r.manual).toEqual({ calls: 2, inputTokens: 1500, outputTokens: 300 });
    expect(r.connector).toBeUndefined();
    expect(r.usd).toBe(0);
  });
});

describe('consumo del connettore', () => {
  async function session() {
    const data = new Map<string, ConnectorState>();
    const store: ConnectorStore = { get: async (c) => structuredClone(data.get(c) ?? null), put: async (c, s) => void data.set(c, structuredClone(s)) };
    const code = newCode();
    data.set(code, { v: 1, updatedAt: 0, setup, printer: printer('bambu-a1'), design: emptyDesign('Prova'), answered: [], language: 'it', languageName: 'Italian', notes: [] });
    const deps = { store, manifold, appUrl: 'https://example.org/app/' };
    const call = async (name: string, args: Record<string, unknown>) => {
      const r = (await handleRpc({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: { codice: code, ...args } } }, deps)) as { result: { content: { text: string }[] } };
      return r.result.content[0].text;
    };
    return { data, code, call };
  }

  it('somma il testo degli strumenti e, alla prima apertura, istruzioni e definizioni', async () => {
    const { data, code, call } = await session();
    const opened = await call('printopus_apri', {});
    const u1 = data.get(code)!.usage!;
    expect(u1.calls).toBe(1);
    expect(u1.inputTokens).toBe(estimateTokens(opened) + SETUP_TOKENS);
    // L'apertura completa (regole, DSL, catalogo) pesa parecchio: è il grosso del consumo.
    expect(u1.inputTokens).toBeGreaterThan(5000);

    const ops = [{ op: 'add_part', part: { id: 'cubo', name: 'Cubo', filamentId: 'f1', shape: { op: 'box', size: [20, 20, 20] } } }];
    const edited = await call('printopus_modifica', { ops });
    const u2 = data.get(code)!.usage!;
    expect(u2.calls).toBe(2);
    expect(u2.inputTokens - u1.inputTokens).toBe(estimateTokens(edited));
    expect(u2.outputTokens - u1.outputTokens).toBe(estimateTokens(JSON.stringify({ codice: code, ops })));
  });

  it('conta anche gli errori, senza cambiare versione', async () => {
    const { data, code, call } = await session();
    await call('printopus_modifica', { ops: [] });
    const s = data.get(code)!;
    expect(s.v).toBe(1);
    expect(s.usage!.calls).toBe(1);
  });
});
