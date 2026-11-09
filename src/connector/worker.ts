import Module, { type ManifoldToplevel } from 'manifold-3d';
// Il file wasm viene caricato da wrangler come modulo compilato (regola CompiledWasm).
import wasmModule from './manifold.wasm';
import { handleRpc, validState, type ConnectorStore } from './server';
import { newCode, normalizeCode, CODE_RE, SESSION_TTL_DAYS, type ConnectorState } from './state';
import { matchOrigin } from './cors';

/* Cloudflare Worker del connettore Printopus:
   - POST /mcp            server MCP per la chat (Claude, ChatGPT…)
   - POST /sessione       la PWA crea una sessione e riceve il codice di abbinamento
   - GET/PUT /sessione/X  la PWA legge e aggiorna lo stato condiviso
   I dati restano nel KV per 7 giorni dall'ultima modifica. */

/** Parte del KV di Cloudflare che serve qui. */
interface KVNamespace {
  get<T>(key: string, type: 'json'): Promise<T | null>;
  put(key: string, value: string, opts?: { expirationTtl?: number }): Promise<void>;
}

interface Env {
  SESSIONS: KVNamespace;
  /** Origine della PWA ammessa per le chiamate /sessione (es. https://marketto.github.io). */
  ALLOWED_ORIGIN?: string;
  /** Indirizzo della PWA per i link nelle risposte. */
  APP_URL?: string;
}

let manifold: Promise<ManifoldToplevel> | null = null;
function loadManifold(): Promise<ManifoldToplevel> {
  if (manifold) return manifold;
  // workerd espone `process` come Node: manifold proverebbe a caricare moduli Node che qui non ci sono.
  const g = globalThis as { process?: unknown };
  const saved = g.process;
  g.process = undefined;
  manifold = Module({
    instantiateWasm: (imports: WebAssembly.Imports, receive: (i: WebAssembly.Instance, m: WebAssembly.Module) => void) => {
      const instance = new WebAssembly.Instance(wasmModule as WebAssembly.Module, imports);
      receive(instance, wasmModule as WebAssembly.Module);
      return instance.exports;
    },
  } as never).then((w) => {
    w.setup();
    return w;
  });
  g.process = saved;
  return manifold;
}

const MAX_BODY = 512 * 1024;

function kvStore(env: Env): ConnectorStore {
  return {
    get: (code) => env.SESSIONS.get<ConnectorState>(code, 'json'),
    put: (code, state) => env.SESSIONS.put(code, JSON.stringify(state), { expirationTtl: SESSION_TTL_DAYS * 86400 }),
  };
}

function cors(env: Env, req: Request): Record<string, string> {
  const origin = req.headers.get('Origin') ?? '';
  const ok = matchOrigin(origin, env.ALLOWED_ORIGIN);
  return {
    'Access-Control-Allow-Origin': ok ?? 'null',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Accept, Mcp-Session-Id, Mcp-Protocol-Version, Authorization',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

const json = (data: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', ...headers } });

async function readJson(req: Request): Promise<unknown> {
  const len = Number(req.headers.get('Content-Length') ?? 0);
  if (len > MAX_BODY) throw new Error('Richiesta troppo grande');
  const body = await req.text();
  if (body.length > MAX_BODY) throw new Error('Richiesta troppo grande');
  return JSON.parse(body);
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    const h = cors(env, req);
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: h });
    const store = kvStore(env);
    try {
      if (url.pathname === '/mcp') {
        if (req.method !== 'POST') return new Response('Usa POST (MCP streamable HTTP, risposte JSON).', { status: 405, headers: { ...h, Allow: 'POST' } });
        const out = await handleRpc(await readJson(req), { store, manifold: loadManifold, appUrl: env.APP_URL ?? 'https://marketto.github.io/tako-maker/' });
        return out === null ? new Response(null, { status: 202, headers: h }) : json(out, 200, h);
      }
      if (url.pathname === '/sessione' && req.method === 'POST') {
        const s = (await readJson(req)) as ConnectorState;
        if (!validState(s)) return json({ error: 'Stato non valido' }, 400, h);
        let code = newCode();
        for (let i = 0; i < 3 && (await store.get(code)); i++) code = newCode();
        const state: ConnectorState = { ...s, v: 1, updatedAt: Date.now(), notes: [] };
        await store.put(code, state);
        return json({ code, v: state.v }, 201, h);
      }
      const m = url.pathname.match(/^\/sessione\/([A-Za-z0-9-]+)$/);
      if (m) {
        const code = normalizeCode(m[1]);
        if (!CODE_RE.test(code)) return json({ error: 'Codice non valido' }, 400, h);
        const cur = await store.get(code);
        if (!cur) return json({ error: 'Sessione non trovata o scaduta' }, 404, h);
        if (req.method === 'GET') return json(cur, 200, { ...h, 'Cache-Control': 'no-store' });
        if (req.method === 'PUT') {
          const { baseV, state } = (await readJson(req)) as { baseV: number; state: ConnectorState };
          if (!validState(state)) return json({ error: 'Stato non valido' }, 400, h);
          if (baseV !== cur.v) return json({ error: 'conflitto', state: cur }, 409, h);
          const next: ConnectorState = { ...state, notes: cur.notes, v: cur.v + 1, updatedAt: Date.now() };
          await store.put(code, next);
          return json({ v: next.v }, 200, h);
        }
      }
      if (url.pathname === '/') return new Response('Printopus: connettore MCP. Indirizzo per la chat: /mcp', { headers: { ...h, 'Content-Type': 'text/plain; charset=utf-8' } });
      return json({ error: 'Non trovato' }, 404, h);
    } catch (e) {
      return json({ error: (e as Error).message }, 400, h);
    }
  },
};
