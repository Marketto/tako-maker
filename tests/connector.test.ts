import { describe, expect, it } from 'vitest';
import { handleRpc, type ConnectorStore } from '../src/connector/server';
import { newCode, normalizeCode, CODE_RE, type ConnectorState } from '../src/connector/state';
import { emptyDesign } from '../src/core/types';
import { manifold, printer, setup } from './fixtures';

function memStore(): ConnectorStore & { data: Map<string, ConnectorState> } {
  const data = new Map<string, ConnectorState>();
  return { data, get: async (c) => structuredClone(data.get(c) ?? null), put: async (c, s) => void data.set(c, structuredClone(s)) };
}

async function setupSession() {
  const store = memStore();
  const code = newCode();
  store.data.set(code, { v: 1, updatedAt: 0, setup: { ...setup, hasMulti: true }, printer: printer('bambu-a1'), design: emptyDesign('Prova'), answered: [], language: 'de', languageName: 'German', notes: [] });
  const deps = { store, manifold, appUrl: 'https://example.org/app/' };
  let id = 0;
  const call = async (name: string, args: Record<string, unknown>) => {
    const r = (await handleRpc({ jsonrpc: '2.0', id: ++id, method: 'tools/call', params: { name, arguments: { codice: code, ...args } } }, deps)) as { result: { content: { text: string }[]; isError?: boolean } };
    return { text: r.result.content[0].text, isError: !!r.result.isError };
  };
  return { store, code, deps, call };
}

describe('connettore MCP', () => {
  it('codici di abbinamento leggibili', () => {
    const c = newCode();
    expect(c).toMatch(CODE_RE);
    expect(normalizeCode(c.toLowerCase().replace(/-/g, ' '))).toBe(c);
  });

  it('protocollo: initialize, notifiche, elenco strumenti', async () => {
    const { deps } = await setupSession();
    const init = (await handleRpc({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18' } }, deps)) as { result: { serverInfo: { name: string }; instructions: string } };
    expect(init.result.serverInfo.name).toBe('printopus');
    expect(init.result.instructions).toMatch(/codice/);
    expect(await handleRpc({ jsonrpc: '2.0', method: 'notifications/initialized' }, deps)).toBeNull();
    const list = (await handleRpc({ jsonrpc: '2.0', id: 2, method: 'tools/list' }, deps)) as { result: { tools: { name: string }[] } };
    expect(list.result.tools.map((t) => t.name)).toEqual(['printopus_apri', 'printopus_modifica', 'printopus_rispondi', 'printopus_mostra_risultati']);
    const bad = (await handleRpc({ jsonrpc: '2.0', id: 3, method: 'resources/list' }, deps)) as { error: { code: number } };
    expect(bad.error.code).toBe(-32601);
  });

  it('apre il progetto con regole, stampante e lingua dell’utente', async () => {
    const { call } = await setupSession();
    const r = await call('printopus_apri', {});
    expect(r.isError).toBe(false);
    expect(r.text).toContain('Bambu Lab A1');
    expect(r.text).toContain('German');
    expect(r.text).toContain('printopus_modifica');
    expect(r.text).toContain('#/collega/');
  });

  it('alla prima apertura segna il collegamento e cambia versione, una volta sola', async () => {
    const { call, store, code } = await setupSession();
    const v0 = (await store.get(code))!.v;
    await call('printopus_apri', {});
    const s1 = (await store.get(code))!;
    expect(s1.openedAt).toBeGreaterThan(0);
    expect(s1.v).toBe(v0 + 1);
    await call('printopus_apri', {});
    expect((await store.get(code))!.v).toBe(v0 + 1);
  });

  it('modifica il modello, salva la nuova versione e propone le domande dell’app', async () => {
    const { call, store, code } = await setupSession();
    const r = await call('printopus_modifica', {
      riassunto: 'scatola',
      messaggio: 'Ecco la scatola.',
      ops: [
        { op: 'add_part', part: { id: 'base', name: 'Base', filamentId: 'f1', shape: { op: 'box', size: [60, 40, 20] } } },
        { op: 'add_part', part: { id: 'tappo', name: 'Tappo', filamentId: 'f2', shape: { op: 'box', size: [60, 40, 4], at: [0, 0, 20] } } },
        { op: 'add_hardware', item: { id: 'mag', name: 'Magnete', qty: 2, decision: 'buy' } },
      ],
    });
    expect(r.isError).toBe(false);
    const s = store.data.get(code)!;
    expect(s.v).toBe(2);
    expect(s.design.parts).toHaveLength(2);
    expect(s.design.hardware![0].decision).toBeUndefined();
    expect(s.notes.at(-1)!.text).toBe('Ecco la scatola.');
    expect(r.text).toMatch(/\[hardware:mag:/);

    const key = r.text.match(/\[(hardware:[^\]]+)\]/)![1];
    const a = await call('printopus_rispondi', { domanda: key, opzioni: ['buy'] });
    expect(a.isError).toBe(false);
    expect(store.data.get(code)!.design.hardware![0].decision).toBe('buy');
    expect(store.data.get(code)!.answered).toContain(key);

    const bad = await call('printopus_modifica', { ops: [{ op: 'remove_part', id: 'nope' }] });
    expect(bad.isError).toBe(true);
    expect(store.data.get(code)!.v).toBe(3);
  });

  it('mostra i risultati di ricerca e rifiuta codici sconosciuti', async () => {
    const { call, store, code, deps } = await setupSession();
    const r = await call('printopus_mostra_risultati', { risultati: [{ title: 'Vaso', url: 'https://www.printables.com/model/1', license: 'CC BY', summary: 'Un vaso' }] });
    expect(r.isError).toBe(false);
    expect(store.data.get(code)!.notes.at(-1)!.results).toHaveLength(1);
    const out = (await handleRpc({ jsonrpc: '2.0', id: 9, method: 'tools/call', params: { name: 'printopus_apri', arguments: { codice: 'AAAA-BBBB-CC' } } }, deps)) as { result: { isError: boolean; content: { text: string }[] } };
    expect(out.result.isError).toBe(true);
    expect(out.result.content[0].text).toMatch(/scaduto|Nessun progetto/);
  });
});
