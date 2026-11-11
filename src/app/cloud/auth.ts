import { CloudAuthError, type CloudKind } from './drives';

/* Collegamento OAuth senza server, con un passaggio dalla pagina del provider:
   - Dropbox: codice + PKCE, con token di rinnovo (il collegamento dura finché non lo togli);
   - Google: token diretto (dura un'ora, poi si ricollega con un tocco).
   Gli id delle app (pubblici, non segreti) arrivano dalla build: VITE_DROPBOX_APP_KEY e
   VITE_GOOGLE_CLIENT_ID. Senza, l'opzione non compare. */

export interface CloudTokens {
  kind: CloudKind;
  access: string;
  /** Scadenza del token di accesso (ms). */
  exp: number;
  refresh?: string;
}

interface Pending {
  kind: CloudKind;
  state: string;
  verifier?: string;
  /** Pagina dell'app da cui si è partiti (hash), per tornarci. */
  back: string;
}

const LS = 'm3d.cloud';
const SS = 'm3d.cloud.oauth';
const GOOGLE_SCOPE = 'https://www.googleapis.com/auth/drive.file';

export interface KVs {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
  removeItem(k: string): void;
}

export function loadTokens(kv: KVs = localStorage): CloudTokens | null {
  try {
    const t = JSON.parse(kv.getItem(LS) ?? 'null') as CloudTokens | null;
    return t && (t.kind === 'dropbox' || t.kind === 'gdrive') ? t : null;
  } catch {
    return null;
  }
}
export const saveTokens = (t: CloudTokens | null, kv: KVs = localStorage) => (t ? kv.setItem(LS, JSON.stringify(t)) : kv.removeItem(LS));

const redirectUri = () => `${location.origin}${location.pathname}`;

function randomString(n: number): string {
  const a = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
  return [...crypto.getRandomValues(new Uint8Array(n))].map((x) => a[x % a.length]).join('');
}

export async function pkceChallenge(verifier: string): Promise<string> {
  const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)));
  return btoa(String.fromCharCode(...hash)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Porta l'utente alla pagina di autorizzazione del provider. */
export async function beginAuth(kind: CloudKind, clientId: string) {
  const pending: Pending = { kind, state: `${kind}.${randomString(24)}`, back: location.hash };
  let url: string;
  if (kind === 'dropbox') {
    pending.verifier = randomString(64);
    url = `https://www.dropbox.com/oauth2/authorize?${new URLSearchParams({
      client_id: clientId,
      response_type: 'code',
      code_challenge: await pkceChallenge(pending.verifier),
      code_challenge_method: 'S256',
      token_access_type: 'offline',
      redirect_uri: redirectUri(),
      state: pending.state,
    })}`;
  } else {
    url = `https://accounts.google.com/o/oauth2/v2/auth?${new URLSearchParams({
      client_id: clientId,
      response_type: 'token',
      scope: GOOGLE_SCOPE,
      include_granted_scopes: 'true',
      redirect_uri: redirectUri(),
      state: pending.state,
    })}`;
  }
  sessionStorage.setItem(SS, JSON.stringify(pending));
  location.assign(url);
}

/** Parametri del ritorno dal provider: Dropbox nella query, Google nell'hash. */
export function parseReturn(search: string, hash: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const src of [search.replace(/^\?/, ''), hash.replace(/^#/, '')]) {
    if (!/(^|&)(state|code|access_token|error)=/.test(src)) continue;
    new URLSearchParams(src).forEach((v, k) => (out[k] = v));
  }
  return out;
}

/** Da chiamare all'avvio, prima di disegnare l'app: completa un collegamento in corso. */
export async function completeAuth(ids: Partial<Record<CloudKind, string>>, f: typeof fetch = fetch): Promise<{ kind: CloudKind } | { error: string } | null> {
  let pending: Pending | null = null;
  try {
    pending = JSON.parse(sessionStorage.getItem(SS) ?? 'null') as Pending | null;
  } catch {
    pending = null;
  }
  const p = parseReturn(location.search, location.hash);
  if (!pending || !p.state || p.state !== pending.state) return null;
  sessionStorage.removeItem(SS);
  history.replaceState(null, '', `${location.pathname}${pending.back}`);
  if (p.error) return { error: p.error_description || p.error };

  if (pending.kind === 'dropbox') {
    const res = await f('https://api.dropboxapi.com/oauth2/token', {
      method: 'POST',
      body: new URLSearchParams({ code: p.code ?? '', grant_type: 'authorization_code', code_verifier: pending.verifier ?? '', client_id: ids.dropbox ?? '', redirect_uri: redirectUri() }),
    });
    if (!res.ok) return { error: `Dropbox: HTTP ${res.status}` };
    const t = (await res.json()) as { access_token: string; expires_in: number; refresh_token?: string };
    saveTokens({ kind: 'dropbox', access: t.access_token, exp: Date.now() + t.expires_in * 1000, refresh: t.refresh_token });
    return { kind: 'dropbox' };
  }
  if (!p.access_token) return { error: 'Google: token mancante' };
  saveTokens({ kind: 'gdrive', access: p.access_token, exp: Date.now() + Number(p.expires_in || 3600) * 1000 });
  return { kind: 'gdrive' };
}

/** Token valido per le chiamate: Dropbox si rinnova da solo, Google chiede di ricollegarsi. */
export async function accessToken(ids: Partial<Record<CloudKind, string>>, f: typeof fetch = fetch, kv: KVs = localStorage): Promise<string> {
  const t = loadTokens(kv);
  if (!t) throw new CloudAuthError();
  if (t.exp > Date.now() + 60_000) return t.access;
  if (t.kind !== 'dropbox' || !t.refresh) throw new CloudAuthError();
  const res = await f('https://api.dropboxapi.com/oauth2/token', {
    method: 'POST',
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: t.refresh, client_id: ids.dropbox ?? '' }),
  });
  if (res.status === 400 || res.status === 401) throw new CloudAuthError();
  if (!res.ok) throw new Error(`Dropbox: HTTP ${res.status}`);
  const r = (await res.json()) as { access_token: string; expires_in: number };
  saveTokens({ ...t, access: r.access_token, exp: Date.now() + r.expires_in * 1000 }, kv);
  return r.access_token;
}
