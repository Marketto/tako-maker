import { describe, expect, it } from 'vitest';
import { openaiAdapter } from '../src/agent/providers/openai';
import { geminiAdapter, sanitizeSchema } from '../src/agent/providers/gemini';
import { anthropicAdapter } from '../src/agent/providers/anthropic';
import { KeyRouter } from '../src/agent/providers/keyRouter';
import { Budget, type KV } from '../src/agent/budget';
import type { ApiRequest } from '../src/agent/client';
import type { KeyEntry } from '../src/agent/providers/types';
import { TOOL_DEFS } from '../src/agent/tools';

const memKV = (): KV => {
  const m = new Map<string, string>();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v) };
};

const req: ApiRequest = {
  tier: 'smart',
  max_tokens: 1000,
  system: [{ type: 'text', text: 'Sei un assistente.' }, { type: 'text', text: 'Stampante: A1', cache_control: { type: 'ephemeral' } }],
  tools: [TOOL_DEFS.edit_design, TOOL_DEFS.print_report, TOOL_DEFS.web_search],
  messages: [
    { role: 'user', content: 'fai un cubo' },
    { role: 'assistant', content: [{ type: 'text', text: 'Ok' }, { type: 'tool_use', id: 'call_1', name: 'edit_design', input: { ops: [] }, signature: 'SIG' }] },
    { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'call_1', content: 'OK. Parti: cubo' }] },
  ],
};
const key = (provider: KeyEntry['provider'], id: string = provider): KeyEntry => ({ id, provider, label: id, key: `k-${id}`, enabled: true });
const body = (c: { init: RequestInit }) => JSON.parse(String(c.init.body));

describe('adattatore OpenAI (Responses API)', () => {
  it('traduce sistema, chiamate di funzione e risultati', () => {
    const c = openaiAdapter.build(req, 'gpt-6.1-sol', key('openai'));
    const b = body(c);
    expect(c.url).toBe('https://api.openai.com/v1/responses');
    expect((c.init.headers as Record<string, string>).authorization).toBe('Bearer k-openai');
    expect(b.instructions).toContain('Stampante: A1');
    expect(b.input).toEqual([
      { role: 'user', content: 'fai un cubo' },
      { role: 'assistant', content: 'Ok' },
      { type: 'function_call', call_id: 'call_1', name: 'edit_design', arguments: '{"ops":[]}' },
      { type: 'function_call_output', call_id: 'call_1', output: 'OK. Parti: cubo' },
    ]);
    expect(b.tools.map((t: { type: string; name?: string }) => t.name ?? t.type)).toEqual(['edit_design', 'print_report', 'web_search']);
  });
  it('legge testo, chiamate, ricerche e cache', () => {
    const r = openaiAdapter.parse({
      id: 'r1',
      output: [
        { type: 'web_search_call' },
        { type: 'message', content: [{ type: 'output_text', text: 'Ecco' }] },
        { type: 'function_call', call_id: 'c9', name: 'edit_design', arguments: '{"ops":[{"op":"set_meta"}]}' },
      ],
      usage: { input_tokens: 1000, output_tokens: 50, input_tokens_details: { cached_tokens: 800 } },
    });
    expect(r.stop_reason).toBe('tool_use');
    expect(r.content[1]).toMatchObject({ type: 'tool_use', id: 'c9', input: { ops: [{ op: 'set_meta' }] } });
    expect(r.usage).toMatchObject({ input_tokens: 200, cache_read_input_tokens: 800, server_tool_use: { web_search_requests: 1 } });
  });
  it('riconosce il credito esaurito', () => {
    expect(openaiAdapter.classify(429, { error: { code: 'insufficient_quota', message: 'You exceeded your current quota' } }).kind).toBe('exhausted');
    expect(openaiAdapter.classify(429, { error: { code: 'rate_limit_exceeded', message: 'slow down' } }).kind).toBe('rate');
  });
});

describe('adattatore Gemini (generateContent)', () => {
  it('traduce ruoli, funzioni (con firma) e ricerca Google', () => {
    const c = geminiAdapter.build(req, 'gemini-3.8-flash', key('gemini'));
    const b = body(c);
    expect(c.url).toContain('/models/gemini-3.8-flash:generateContent');
    expect((c.init.headers as Record<string, string>)['x-goog-api-key']).toBe('k-gemini');
    expect(b.systemInstruction.parts[0].text).toContain('Sei un assistente.');
    expect(b.contents.map((x: { role: string }) => x.role)).toEqual(['user', 'model', 'user']);
    expect(b.contents[1].parts[1]).toEqual({ functionCall: { name: 'edit_design', args: { ops: [] }, id: 'call_1' }, thoughtSignature: 'SIG' });
    expect(b.contents[2].parts[0].functionResponse).toMatchObject({ name: 'edit_design', response: { result: 'OK. Parti: cubo' } });
    const decls = b.tools[0].functionDeclarations;
    expect(decls.find((d: { name: string }) => d.name === 'print_report').parameters).toBeUndefined();
    expect(b.tools[1]).toEqual({ googleSearch: {} });
  });
  it('legge le chiamate e conserva la firma del ragionamento', () => {
    const r = geminiAdapter.parse({
      candidates: [{ content: { parts: [{ text: 'pensiero', thought: true }, { text: 'Fatto' }, { functionCall: { name: 'edit_design', args: { ops: [] } }, thoughtSignature: 'XYZ' }] }, groundingMetadata: { webSearchQueries: ['a', 'b'] } }],
      usageMetadata: { promptTokenCount: 500, candidatesTokenCount: 40, thoughtsTokenCount: 60, cachedContentTokenCount: 300 },
    });
    expect(r.content).toHaveLength(2);
    expect(r.content[1]).toMatchObject({ type: 'tool_use', name: 'edit_design', signature: 'XYZ' });
    expect(r.usage).toMatchObject({ input_tokens: 200, output_tokens: 100, cache_read_input_tokens: 300, server_tool_use: { web_search_requests: 2 } });
  });
  it('ripulisce lo schema JSON', () => {
    expect(sanitizeSchema({ type: 'object', additionalProperties: false, properties: { a: { type: 'string', $comment: 'x' } } })).toEqual({ type: 'object', properties: { a: { type: 'string' } } });
  });
});

describe('adattatore Claude', () => {
  it('toglie i campi interni prima dell’invio', () => {
    const b = body(anthropicAdapter.build(req, 'claude-sonnet-5-5', key('anthropic')));
    expect(b.messages[1].content[1].signature).toBeUndefined();
    expect(b.system[1].cache_control).toEqual({ type: 'ephemeral' });
  });
  it('usa il proxy se configurato', () => {
    const c = anthropicAdapter.build(req, 'claude-sonnet-5-5', { ...key('anthropic'), key: '', baseUrl: 'https://proxy.example/', accessCode: 'abc' });
    expect(c.url).toBe('https://proxy.example/v1/messages');
    expect((c.init.headers as Record<string, string>)['x-access-code']).toBe('abc');
    expect((c.init.headers as Record<string, string>)['x-api-key']).toBeUndefined();
  });
});

describe('router delle chiavi', () => {
  const okClaude = { id: 'm', content: [{ type: 'text', text: 'ciao' }], stop_reason: 'end_turn', usage: { input_tokens: 10, output_tokens: 5 } };
  function fetchSeq(responses: [number, unknown][], urls: string[]): typeof fetch {
    return (async (url: string) => {
      urls.push(url);
      const [status, b] = responses.shift()!;
      return new Response(JSON.stringify(b), { status, headers: { 'content-type': 'application/json' } });
    }) as unknown as typeof fetch;
  }

  it('passa alla chiave successiva se il credito è finito, e la mette in pausa', async () => {
    const urls: string[] = [];
    const kv = memKV();
    let now = 1_000_000;
    const keys = [key('anthropic', 'a1'), key('openai', 'o1'), key('anthropic', 'a2')];
    const r = new KeyRouter(() => keys, kv, new Budget(memKV(), 10), fetchSeq([
      [400, { error: { type: 'invalid_request_error', message: 'Your credit balance is too low to access the Anthropic API.' } }],
      [429, { error: { code: 'insufficient_quota', message: 'You exceeded your current quota' } }],
      [200, okClaude],
      [200, okClaude],
    ], urls), () => now);
    const res = await r.send({ ...req, tools: [] });
    expect(res.keyLabel).toBe('a2');
    expect(urls).toHaveLength(3);
    expect(r.states().a1.reason).toBe('exhausted');
    // la richiesta successiva salta direttamente le chiavi in pausa
    await r.send({ ...req, tools: [] });
    expect(urls).toHaveLength(4);
    expect(urls[3]).toContain('anthropic');
    // dopo 24 ore si riprova la prima
    now += 25 * 3600_000;
    expect(r.isAvailable(keys[0])).toBe(true);
  });

  it('una chiave non valida torna disponibile solo se viene modificata', () => {
    const kv = memKV();
    const k = key('gemini', 'g1');
    const r = new KeyRouter(() => [k], kv, new Budget(memKV(), 10), fetchSeq([], []));
    kv.setItem('m3d.keystate', JSON.stringify({ g1: { reason: 'invalid', fingerprint: `gemini:${k.key.slice(-6)}::${k.key.length}` } }));
    expect(r.isAvailable(k)).toBe(false);
    expect(r.isAvailable({ ...k, key: 'nuova-chiave-123' })).toBe(true);
  });

  it('se nessuna chiave funziona spiega perché', async () => {
    const r = new KeyRouter(() => [key('openai', 'o1')], memKV(), new Budget(memKV(), 10), fetchSeq([[401, { error: { message: 'Incorrect API key' } }]], []));
    await expect(r.send({ ...req, tools: [] })).rejects.toThrow(/o1: chiave non valida/);
  });

  it('conta la spesa con i prezzi del provider usato', async () => {
    const budgetKv = memKV();
    const r = new KeyRouter(() => [key('gemini', 'g1')], memKV(), new Budget(budgetKv, 10), fetchSeq([[200, { candidates: [{ content: { parts: [{ text: 'ok' }] } }], usageMetadata: { promptTokenCount: 1_000_000, candidatesTokenCount: 0 } }]], []));
    const res = await r.send({ ...req, tools: [] });
    expect(res.costUsd).toBeCloseTo(0.75, 5);
    expect(res.provider).toBe('gemini');
  });
});
