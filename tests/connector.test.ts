import { describe, expect, it } from 'vitest';
import { apiCreate, apiPut, apiReport, handleRpc, LONG_CHAT_CALLS } from '../src/connector/server';
import { designKey, newCode, normalizeCode, CODE_RE, type ConnectorState } from '../src/connector/state';
import { emptyDesign } from '../src/core/types';
import { printer, setup } from './fixtures';
import { connectorSession } from './connectorApp';

const initial = (): ConnectorState => ({ v: 1, updatedAt: 0, setup: { ...setup, hasMulti: true }, printer: printer('bambu-a1'), design: emptyDesign('Prova'), answered: [], language: 'de', languageName: 'German', notes: [] });
const box = (id: string, z = 0) => ({ op: 'add_part', part: { id, name: id, filamentId: 'f1', shape: { op: 'box', size: [20, 20, 10], at: [0, 0, z] } } });

async function setupSession(opts: { appOpen?: boolean } = {}) {
  const code = newCode();
  const { store, deps, state } = await connectorSession(code, initial(), opts);
  let id = 0;
  const call = async (name: string, args: Record<string, unknown>) => {
    const r = (await handleRpc({ jsonrpc: '2.0', id: ++id, method: 'tools/call', params: { name, arguments: { codice: code, ...args } } }, deps)) as { result: { content: { text: string }[]; isError?: boolean } };
    return { text: r.result.content[0].text, isError: !!r.result.isError };
  };
  return { store, code, deps, call, state };
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
    expect(list.result.tools.map((t) => t.name)).toEqual(['printopus_apri', 'printopus_stato', 'printopus_modifica', 'printopus_rispondi', 'printopus_mostra_risultati']);
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
    const { call, state } = await setupSession();
    const v0 = state().v;
    await call('printopus_apri', {});
    expect(state().openedAt).toBeDefined();
    expect(state().v).toBe(v0 + 1);
    await call('printopus_apri', {});
    expect(state().v).toBe(v0 + 1);
  });

  it('modifica il modello, salva la nuova versione e propone le domande dell’app', async () => {
    const { call, state } = await setupSession();
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
    const s = state();
    expect(s.v).toBe(2);
    expect(s.design.parts).toHaveLength(2);
    expect(s.design.hardware![0].decision).toBeUndefined();
    expect(s.notes.at(-1)!.text).toBe('Ecco la scatola.');
    expect(r.text).toMatch(/\[hardware:mag:/);

    const key = r.text.match(/\[(hardware:[^\]]+)\]/)![1];
    const a = await call('printopus_rispondi', { domanda: key, opzioni: ['buy'] });
    expect(a.isError).toBe(false);
    expect(state().design.hardware![0].decision).toBe('buy');
    expect(state().answered).toContain(key);

    const bad = await call('printopus_modifica', { ops: [{ op: 'remove_part', id: 'nope' }] });
    expect(bad.isError).toBe(true);
    expect(state().v).toBe(3);
  });

  it('mostra i risultati di ricerca e rifiuta codici sconosciuti', async () => {
    const { call, state, deps } = await setupSession();
    const r = await call('printopus_mostra_risultati', { risultati: [{ title: 'Vaso', url: 'https://www.printables.com/model/1', license: 'CC BY', summary: 'Un vaso' }] });
    expect(r.isError).toBe(false);
    expect(state().notes.at(-1)!.results).toHaveLength(1);
    const out = (await handleRpc({ jsonrpc: '2.0', id: 9, method: 'tools/call', params: { name: 'printopus_apri', arguments: { codice: 'AAAA-BBBB-CC' } } }, deps)) as { result: { isError: boolean; content: { text: string }[] } };
    expect(out.result.isError).toBe(true);
    expect(out.result.content[0].text).toMatch(/scaduto|Nessun progetto/);
  });

  it('due modifiche contemporanee non si cancellano a vicenda', async () => {
    const { call, state } = await setupSession();
    const [a, b] = await Promise.all([call('printopus_modifica', { ops: [box('a')] }), call('printopus_modifica', { ops: [box('b', 30)] })]);
    expect(a.isError || b.isError).toBe(false);
    expect(state().design.parts.map((p) => p.id).sort()).toEqual(['a', 'b']);
    expect(state().v).toBe(3);
  });

  it('con l’app chiusa salva la modifica e dice di non ripeterla', async () => {
    const { call, state } = await setupSession({ appOpen: false });
    const r = await call('printopus_modifica', { ops: [box('a')] });
    expect(r.isError).toBe(false);
    expect(r.text).toMatch(/salvata.*non ripeterla/);
    expect(r.text).toMatch(/non risponde/);
    expect(state().design.parts).toHaveLength(1);
    const q = await call('printopus_rispondi', { domanda: 'x', opzioni: ['y'] });
    expect(q.isError).toBe(true);
  });

  it('API dell’app: versione vecchia rifiutata, analisi solo per il modello attuale', async () => {
    const { deps, code, state, call } = await setupSession();
    await call('printopus_modifica', { ops: [box('a')] });
    const v = state().v;
    const stale = await apiPut(deps, code, { baseV: v - 1, state: { ...state(), design: emptyDesign('Vecchio') } });
    expect(stale.status).toBe(409);
    expect(state().design.parts).toHaveLength(1);
    const ok = await apiPut(deps, code, { baseV: v, state: { ...state(), design: { ...state().design, name: 'Nuovo' } } });
    expect(ok.status).toBe(200);
    expect(state().v).toBe(v + 1);
    const old = await apiReport(deps, code, { key: 'vecchia', text: '', questions: [], errors: [] });
    expect(old.status).toBe(409);
    const cur = await apiReport(deps, code, { key: designKey(state()), text: 'Analisi', questions: [], errors: [] });
    expect(cur.status).toBe(200);
    expect(state().report!.text).toBe('Analisi');
    const created = await apiCreate(deps, initial(), () => code);
    expect(created.status).toBe(503);
  });

  it('stato leggero, ultimi messaggi in apertura e consiglio di una chat nuova quando è lunga', async () => {
    const { call, code } = await setupSession();
    const opened = await call('printopus_apri', {});
    await call('printopus_modifica', { ops: [box('a')], messaggio: 'Ecco il primo cubo.' });
    const stato = await call('printopus_stato', {});
    expect(stato.isError).toBe(false);
    expect(stato.text).toContain('## Analisi di stampa');
    expect(stato.text.length).toBeLessThan(opened.text.length / 3);
    expect((await call('printopus_apri', {})).text).toContain('Assistente: Ecco il primo cubo.');
    const texts: string[] = [];
    for (let i = 1; i < LONG_CHAT_CALLS; i++) texts.push((await call('printopus_stato', {})).text);
    expect(texts.slice(0, -1).some((t) => t.includes('chat nuova'))).toBe(false);
    expect(texts.at(-1)).toContain(`Usa Printopus con il codice ${code}`);
  });
});
