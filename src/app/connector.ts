import type { ConnectorState } from '../connector/state';
import { store } from './store';

/* Client della PWA per il connettore MCP (Cloudflare Worker): crea la sessione
   con il codice di abbinamento e tiene sincronizzato lo stato con la chat. */

/** Indirizzo del connettore: dalle impostazioni o quello pubblicato con l'app. */
export function connectorBase(): string {
  const fromSettings = store.get().settings.connectorUrl?.trim();
  const built = (import.meta.env.VITE_CONNECTOR_URL as string | undefined) ?? '';
  return (fromSettings || built).replace(/\/(mcp)?\/?$/, '');
}

/** Indirizzo da aggiungere nella chat come connettore personalizzato. */
export const mcpUrl = (base = connectorBase()) => (base ? `${base}/mcp` : '');

async function call<T>(path: string, init?: RequestInit): Promise<{ status: number; body: T }> {
  const base = connectorBase();
  if (!base) throw new Error('connettore non configurato');
  const res = await fetch(`${base}${path}`, { ...init, headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) } });
  const body = (await res.json().catch(() => null)) as T;
  return { status: res.status, body };
}

export async function createSession(state: Omit<ConnectorState, 'v' | 'updatedAt' | 'notes'>): Promise<{ code: string; v: number }> {
  const r = await call<{ code: string; v: number; error?: string }>('/sessione', { method: 'POST', body: JSON.stringify({ ...state, v: 0, updatedAt: 0, notes: [] }) });
  if (r.status !== 201) throw new Error(r.body?.error ?? `HTTP ${r.status}`);
  return r.body;
}

export async function getSession(code: string): Promise<ConnectorState | null> {
  const r = await call<ConnectorState>(`/sessione/${code}`, { cache: 'no-store' });
  if (r.status === 404) return null;
  if (r.status !== 200) throw new Error(`HTTP ${r.status}`);
  return r.body;
}

export async function putSession(code: string, baseV: number, state: ConnectorState): Promise<{ v: number } | { conflict: ConnectorState }> {
  const r = await call<{ v: number; state?: ConnectorState; error?: string }>(`/sessione/${code}`, { method: 'PUT', body: JSON.stringify({ baseV, state }) });
  if (r.status === 409 && r.body?.state) return { conflict: r.body.state };
  if (r.status !== 200) throw new Error(r.body?.error ?? `HTTP ${r.status}`);
  return { v: r.body.v };
}
