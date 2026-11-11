/* Adattatori per gli spazi cloud dell'utente. Tutto avviene nel browser, con il
   token dell'utente: l'app non ha un server e non vede i file.
   - Dropbox: cartella dell'app (Apps/Printopus), accesso solo a quella.
   - Google Drive: cartella "Printopus" con il permesso drive.file (solo i file creati dall'app). */

export type CloudKind = 'dropbox' | 'gdrive';

export interface CloudFile {
  name: string;
  modified: number;
}

export interface CloudDrive {
  readonly kind: CloudKind;
  list(): Promise<CloudFile[]>;
  read(name: string): Promise<Uint8Array | null>;
  write(name: string, data: Uint8Array): Promise<void>;
  remove(name: string): Promise<void>;
}

/** Il token non vale più: serve ricollegarsi. */
export class CloudAuthError extends Error {
  constructor() {
    super('autorizzazione scaduta');
    this.name = 'CloudAuthError';
  }
}

type Fetch = typeof fetch;
type Token = () => Promise<string>;

async function check(res: Response, what: string): Promise<Response> {
  if (res.status === 401) throw new CloudAuthError();
  if (!res.ok) throw new Error(`${what}: HTTP ${res.status}`);
  return res;
}

const bodyOf = (data: Uint8Array) => new Blob([data as BlobPart], { type: 'application/octet-stream' });

/* ---------- Dropbox ---------- */

const DBX_API = 'https://api.dropboxapi.com/2';
const DBX_CONTENT = 'https://content.dropboxapi.com/2';

/** Dropbox vuole l'argomento in un'intestazione: i caratteri non ASCII vanno scritti come \uXXXX. */
export const dropboxArg = (o: unknown) => JSON.stringify(o).replace(/[\u007f-￿]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`);

export function dropboxDrive(token: Token, f: Fetch = fetch): CloudDrive {
  const rpc = async (path: string, body: unknown) =>
    f(`${DBX_API}${path}`, { method: 'POST', headers: { Authorization: `Bearer ${await token()}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const notFound = async (res: Response) => res.status === 409 && /not_found/.test(await res.clone().text());

  return {
    kind: 'dropbox',
    async list() {
      const out: CloudFile[] = [];
      let res = await rpc('/files/list_folder', { path: '' });
      if (await notFound(res)) return out;
      for (;;) {
        const body = (await (await check(res, 'Dropbox')).json()) as { entries: { '.tag': string; name: string; server_modified?: string }[]; has_more: boolean; cursor: string };
        for (const e of body.entries) if (e['.tag'] === 'file') out.push({ name: e.name, modified: Date.parse(e.server_modified ?? '') || 0 });
        if (!body.has_more) return out;
        res = await rpc('/files/list_folder/continue', { cursor: body.cursor });
      }
    },
    async read(name) {
      const res = await f(`${DBX_CONTENT}/files/download`, { method: 'POST', headers: { Authorization: `Bearer ${await token()}`, 'Dropbox-API-Arg': dropboxArg({ path: `/${name}` }) } });
      if (await notFound(res)) return null;
      return new Uint8Array(await (await check(res, 'Dropbox')).arrayBuffer());
    },
    async write(name, data) {
      const res = await f(`${DBX_CONTENT}/files/upload`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${await token()}`, 'Content-Type': 'application/octet-stream', 'Dropbox-API-Arg': dropboxArg({ path: `/${name}`, mode: 'overwrite', mute: true }) },
        body: bodyOf(data),
      });
      await check(res, 'Dropbox');
    },
    async remove(name) {
      const res = await rpc('/files/delete_v2', { path: `/${name}` });
      if (await notFound(res)) return;
      await check(res, 'Dropbox');
    },
  };
}

/* ---------- Google Drive ---------- */

const GD_API = 'https://www.googleapis.com/drive/v3';
const GD_UPLOAD = 'https://www.googleapis.com/upload/drive/v3';
export const GDRIVE_FOLDER = 'Printopus';
const FOLDER_MIME = 'application/vnd.google-apps.folder';

export function gdriveDrive(token: Token, f: Fetch = fetch): CloudDrive {
  let folderId: string | null = null;
  const ids = new Map<string, string>();
  const auth = async () => ({ Authorization: `Bearer ${await token()}` });
  const q = (s: string) => encodeURIComponent(s);

  async function folder(): Promise<string> {
    if (folderId) return folderId;
    const query = `name='${GDRIVE_FOLDER}' and mimeType='${FOLDER_MIME}' and trashed=false`;
    const found = (await (await check(await f(`${GD_API}/files?q=${q(query)}&fields=files(id)&spaces=drive`, { headers: await auth() }), 'Drive')).json()) as { files: { id: string }[] };
    if (found.files.length) return (folderId = found.files[0].id);
    const res = await f(`${GD_API}/files?fields=id`, { method: 'POST', headers: { ...(await auth()), 'Content-Type': 'application/json' }, body: JSON.stringify({ name: GDRIVE_FOLDER, mimeType: FOLDER_MIME }) });
    return (folderId = ((await (await check(res, 'Drive')).json()) as { id: string }).id);
  }

  async function list(): Promise<CloudFile[]> {
    const parent = await folder();
    const out: CloudFile[] = [];
    let page = '';
    ids.clear();
    do {
      const url = `${GD_API}/files?q=${q(`'${parent}' in parents and trashed=false`)}&fields=nextPageToken,files(id,name,modifiedTime)&pageSize=1000${page ? `&pageToken=${q(page)}` : ''}`;
      const body = (await (await check(await f(url, { headers: await auth() }), 'Drive')).json()) as { nextPageToken?: string; files: { id: string; name: string; modifiedTime: string }[] };
      for (const x of body.files) {
        ids.set(x.name, x.id);
        out.push({ name: x.name, modified: Date.parse(x.modifiedTime) || 0 });
      }
      page = body.nextPageToken ?? '';
    } while (page);
    return out;
  }

  async function idOf(name: string): Promise<string | undefined> {
    if (!ids.has(name)) await list();
    return ids.get(name);
  }

  return {
    kind: 'gdrive',
    list,
    async read(name) {
      const id = await idOf(name);
      if (!id) return null;
      const res = await f(`${GD_API}/files/${id}?alt=media`, { headers: await auth() });
      if (res.status === 404) {
        ids.delete(name);
        return null;
      }
      return new Uint8Array(await (await check(res, 'Drive')).arrayBuffer());
    },
    async write(name, data) {
      const id = await idOf(name);
      if (id) {
        await check(await f(`${GD_UPLOAD}/files/${id}?uploadType=media`, { method: 'PATCH', headers: { ...(await auth()), 'Content-Type': 'application/octet-stream' }, body: bodyOf(data) }), 'Drive');
        return;
      }
      const boundary = `printopus${Date.now().toString(36)}`;
      const meta = JSON.stringify({ name, parents: [await folder()] });
      const body = new Blob([
        `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n--${boundary}\r\nContent-Type: application/octet-stream\r\n\r\n`,
        data as BlobPart,
        `\r\n--${boundary}--`,
      ]);
      const res = await f(`${GD_UPLOAD}/files?uploadType=multipart&fields=id`, { method: 'POST', headers: { ...(await auth()), 'Content-Type': `multipart/related; boundary=${boundary}` }, body });
      ids.set(name, ((await (await check(res, 'Drive')).json()) as { id: string }).id);
    },
    async remove(name) {
      const id = await idOf(name);
      if (!id) return;
      const res = await f(`${GD_API}/files/${id}`, { method: 'DELETE', headers: await auth() });
      ids.delete(name);
      if (res.status !== 404) await check(res, 'Drive');
    },
  };
}
