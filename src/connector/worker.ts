import { apiCreate, apiPut, apiReport, handleRpc, type ServerDeps } from './server';
import { checkReport, newCode, normalizeCode, CODE_RE, SESSION_TTL_DAYS, type ConnectorState, type ConnectorStore, type ReportCheck, type Stored } from './state';
import { matchOrigin } from './cors';

/* Cloudflare Worker del connettore Printopus:
   - POST /mcp                    server MCP per la chat (Claude, ChatGPT…)
   - POST /sessione               la PWA crea una sessione e riceve il codice di abbinamento
   - GET/PUT /sessione/X          la PWA legge e aggiorna lo stato condiviso
   - POST /sessione/X/analisi     la PWA rimanda l'analisi calcolata (il Worker non calcola la geometria)
   Ogni sessione vive in un Durable Object: letture coerenti e scritture una alla volta,
   così una modifica non ne cancella un'altra. I dati restano 7 giorni dall'ultima modifica. */

interface DurableObjectStorage {
  get<T>(key: string): Promise<T | undefined>;
  put(key: string, value: unknown): Promise<void>;
  deleteAll(): Promise<void>;
  setAlarm(at: number): Promise<void>;
}
interface DurableObjectState {
  storage: DurableObjectStorage;
}
interface DurableObjectStub {
  fetch(url: string, init?: RequestInit): Promise<Response>;
}
interface DurableObjectNamespace {
  idFromName(name: string): unknown;
  get(id: unknown): DurableObjectStub;
}

interface Env {
  SESSION: DurableObjectNamespace;
  /** Origine della PWA ammessa per le chiamate /sessione (es. https://marketto.github.io). */
  ALLOWED_ORIGIN?: string;
  /** Indirizzo della PWA per i link nelle risposte. */
  APP_URL?: string;
}

/** Una sessione: lo stato e la sua revisione, scritti solo se la revisione letta è ancora quella. */
export class SessionStore {
  constructor(private ctx: DurableObjectState) {}

  async fetch(req: Request): Promise<Response> {
    if (req.method === 'GET') {
      const s = (await this.ctx.storage.get<Stored>('s')) ?? null;
      const key = new URL(req.url).searchParams.get('analisi');
      return Response.json(key === null ? s : s && checkReport(s.state, key));
    }
    const { state, rev } = (await req.json()) as { state: ConnectorState; rev: number | null };
    // Tra lettura e scrittura ci sono solo operazioni sullo storage: il Durable Object non fa entrare altre richieste.
    const cur = (await this.ctx.storage.get<Stored>('s')) ?? null;
    if ((cur?.rev ?? null) !== rev) return Response.json({ ok: false });
    await this.ctx.storage.put('s', { state, rev: (cur?.rev ?? 0) + 1 });
    await this.ctx.storage.setAlarm(Date.now() + SESSION_TTL_DAYS * 86400_000);
    return Response.json({ ok: true });
  }

  async alarm() {
    await this.ctx.storage.deleteAll();
  }
}

const MAX_BODY = 512 * 1024;

function doStore(env: Env): ConnectorStore {
  const stub = (code: string) => env.SESSION.get(env.SESSION.idFromName(code));
  return {
    async put(code, state, rev) {
      const r = await stub(code).fetch('https://do/', { method: 'PUT', body: JSON.stringify({ state, rev }) });
      return ((await r.json()) as { ok: boolean }).ok;
    },
    report: async (code, key) => (await (await stub(code).fetch(`https://do/?analisi=${encodeURIComponent(key)}`)).json()) as ReportCheck | null,
    get: async (code) => (await (await stub(code).fetch('https://do/')).json()) as Stored | null,
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
    const deps: ServerDeps = { store: doStore(env), appUrl: env.APP_URL ?? 'https://marketto.github.io/tako-maker/' };
    try {
      if (url.pathname === '/mcp') {
        if (req.method !== 'POST') return new Response('Usa POST (MCP streamable HTTP, risposte JSON).', { status: 405, headers: { ...h, Allow: 'POST' } });
        const out = await handleRpc(await readJson(req), deps);
        return out === null ? new Response(null, { status: 202, headers: h }) : json(out, 200, h);
      }
      if (url.pathname === '/sessione' && req.method === 'POST') {
        const r = await apiCreate(deps, await readJson(req), () => newCode());
        return json(r.body, r.status, h);
      }
      const m = url.pathname.match(/^\/sessione\/([A-Za-z0-9-]+)(\/analisi)?$/);
      if (m) {
        const code = normalizeCode(m[1]);
        if (!CODE_RE.test(code)) return json({ error: 'Codice non valido' }, 400, h);
        if (m[2] && req.method === 'POST') {
          const r = await apiReport(deps, code, await readJson(req));
          return json(r.body, r.status, h);
        }
        if (req.method === 'GET') {
          const cur = await deps.store.get(code);
          return cur ? json(cur.state, 200, { ...h, 'Cache-Control': 'no-store' }) : json({ error: 'Sessione non trovata o scaduta' }, 404, h);
        }
        if (req.method === 'PUT') {
          const r = await apiPut(deps, code, await readJson(req));
          return json(r.body, r.status, h);
        }
      }
      if (url.pathname === '/') return new Response('Printopus: connettore MCP. Indirizzo per la chat: /mcp', { headers: { ...h, 'Content-Type': 'text/plain; charset=utf-8' } });
      return json({ error: 'Non trovato' }, 404, h);
    } catch (e) {
      return json({ error: (e as Error).message }, 400, h);
    }
  },
};
