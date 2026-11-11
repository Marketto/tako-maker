import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { gunzipSync, strFromU8 } from 'fflate';
import { decodeIndex, decodeProject, emptyIndex, encodeIndex, encodeProject, entryOf, projectFile, reconcile, toDownload, withEntry } from '../src/app/cloud/archive';
import { dropboxArg, dropboxDrive, gdriveDrive, CloudAuthError } from '../src/app/cloud/drives';
import { parseReturn, pkceChallenge } from '../src/app/cloud/auth';
import type { Project } from '../src/app/store';
import { emptyDesign } from '../src/core/types';

const project = (id: string, updatedAt: number, name = 'Scatola'): Project => ({
  id,
  name,
  design: emptyDesign(name),
  undo: [],
  chat: [{ id: 'c1', role: 'user', text: 'una scatola' }],
  answered: [],
  meshIds: ['m1'],
  createdAt: 1,
  updatedAt,
});

describe('archivio dei progetti', () => {
  it('codifica e rilegge progetto e mesh, compressi', () => {
    const mesh = { positions: new Float32Array([0, 0, 0, 1.5, 0, 0, 0, 2.25, 0]), indices: new Uint32Array([0, 1, 2]) };
    const data = encodeProject(project('p1', 10), [{ id: 'm1', name: 'Pezzo', mesh }]);
    expect(JSON.parse(strFromU8(gunzipSync(data))).format).toBe('printopus-progetto');
    const back = decodeProject(data);
    expect(back.project.id).toBe('p1');
    expect(back.project.updatedAt).toBe(10);
    expect(back.project.chat[0].text).toBe('una scatola');
    expect([...back.meshes[0].mesh.positions]).toEqual([0, 0, 0, 1.5, 0, 0, 0, 2.25, 0]);
    expect([...back.meshes[0].mesh.indices]).toEqual([0, 1, 2]);
  });

  it('rifiuta file che non sono progetti', () => {
    expect(() => decodeProject(new Uint8Array([1, 2, 3]))).toThrow(/non è leggibile/);
  });

  it('indice: aggiorna, toglie, ricostruisce se rovinato', () => {
    let i = withEntry(emptyIndex(), 'a', entryOf(project('a', 5)));
    i = withEntry(i, 'b', entryOf(project('b', 9)));
    expect(i.projects.map((e) => e.id)).toEqual(['b', 'a']);
    i = withEntry(i, 'a', null);
    expect(decodeIndex(encodeIndex(i)).projects.map((e) => e.id)).toEqual(['b']);
    expect(decodeIndex(new TextEncoder().encode('{rotto')).projects).toEqual([]);
    expect(decodeIndex(null).projects).toEqual([]);
  });

  it('tiene solo le voci con un file e sceglie cosa scaricare', () => {
    const i = [project('a', 5), project('b', 9), project('c', 3)].reduce((acc, p) => withEntry(acc, p.id, entryOf(p)), emptyIndex());
    const r = reconcile(i, [projectFile('a'), projectFile('b')]);
    expect(r.projects.map((e) => e.id).sort()).toEqual(['a', 'b']);
    // a: più recente nel cloud; b: più recente in locale; d: solo locale
    const local = [{ id: 'a', updatedAt: 1 }, { id: 'b', updatedAt: 20 }, { id: 'd', updatedAt: 1 }];
    expect(toDownload(r, local, new Set()).map((e) => e.id)).toEqual(['a']);
    // modifiche locali non ancora caricate: non si sovrascrivono
    expect(toDownload(r, [], new Set(['a'])).map((e) => e.id)).toEqual(['b']);
  });
});

type Call = { url: string; init: RequestInit };
function fakeFetch(handler: (c: Call) => Response): { f: typeof fetch; calls: Call[] } {
  const calls: Call[] = [];
  const f = (async (url: string, init: RequestInit = {}) => {
    const c = { url, init };
    calls.push(c);
    return handler(c);
  }) as unknown as typeof fetch;
  return { f, calls };
}
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { 'content-type': 'application/json' } });
const header = (c: Call, k: string) => (c.init.headers as Record<string, string>)[k];

describe('Dropbox', () => {
  it('scrive l’argomento in ASCII', () => {
    expect(dropboxArg({ path: '/è' })).toBe('{"path":"/\\u00e8"}');
  });

  it('elenca, legge, scrive e cancella nella cartella dell’app', async () => {
    const { f, calls } = fakeFetch((c) => {
      if (c.url.endsWith('/files/list_folder')) return json({ entries: [{ '.tag': 'file', name: 'a.printopus', server_modified: '2026-11-01T10:00:00Z' }, { '.tag': 'folder', name: 'x' }], has_more: true, cursor: 'k' });
      if (c.url.endsWith('/files/list_folder/continue')) return json({ entries: [{ '.tag': 'file', name: 'progetti.json' }], has_more: false, cursor: 'k' });
      if (c.url.endsWith('/files/download')) return header(c, 'Dropbox-API-Arg').includes('manca') ? new Response('{"error_summary":"path/not_found/"}', { status: 409 }) : new Response(new Uint8Array([7, 8]));
      return json({});
    });
    const d = dropboxDrive(async () => 'TOK', f);
    expect((await d.list()).map((x) => x.name)).toEqual(['a.printopus', 'progetti.json']);
    expect(await d.read('manca.printopus')).toBeNull();
    expect([...(await d.read('a.printopus'))!]).toEqual([7, 8]);
    await d.write('a.printopus', new Uint8Array([1]));
    const up = calls.find((c) => c.url.endsWith('/files/upload'))!;
    expect(JSON.parse(header(up, 'Dropbox-API-Arg'))).toEqual({ path: '/a.printopus', mode: 'overwrite', mute: true });
    expect(header(up, 'Authorization')).toBe('Bearer TOK');
    await d.remove('a.printopus');
    expect(calls.at(-1)!.url).toMatch(/delete_v2$/);
  });

  it('cartella dell’app ancora vuota e token scaduto', async () => {
    const empty = dropboxDrive(async () => 't', fakeFetch(() => new Response('{"error_summary":"path/not_found/.."}', { status: 409 })).f);
    expect(await empty.list()).toEqual([]);
    const expired = dropboxDrive(async () => 't', fakeFetch(() => new Response('', { status: 401 })).f);
    await expect(expired.list()).rejects.toBeInstanceOf(CloudAuthError);
  });
});

describe('Google Drive', () => {
  it('crea la cartella, carica un file nuovo e poi lo aggiorna', async () => {
    const { f, calls } = fakeFetch((c) => {
      const method = c.init.method ?? 'GET';
      if (method === 'GET' && c.url.includes('fields=files(id)')) return json({ files: [] });
      if (method === 'POST' && c.url.endsWith('/drive/v3/files?fields=id')) return json({ id: 'FOLDER' });
      if (method === 'GET' && c.url.includes('in%20parents')) return json({ files: [] });
      if (method === 'POST' && c.url.includes('uploadType=multipart')) return json({ id: 'FILE1' });
      return json({});
    });
    const d = gdriveDrive(async () => 'TOK', f);
    await d.write('a.printopus', new Uint8Array([1, 2]));
    const multipart = calls.find((c) => c.url.includes('uploadType=multipart'))!;
    const body = await (multipart.init.body as Blob).text();
    expect(body).toContain('"parents":["FOLDER"]');
    expect(body).toContain('"name":"a.printopus"');
    await d.write('a.printopus', new Uint8Array([3]));
    expect(calls.at(-1)!.init.method).toBe('PATCH');
    expect(calls.at(-1)!.url).toContain('/files/FILE1?uploadType=media');
  });
});

describe('collegamento', () => {
  it('legge il ritorno di Dropbox (query) e di Google (hash)', () => {
    expect(parseReturn('?code=abc&state=dropbox.x', '')).toEqual({ code: 'abc', state: 'dropbox.x' });
    expect(parseReturn('', '#state=gdrive.y&access_token=T&expires_in=3599')).toMatchObject({ state: 'gdrive.y', access_token: 'T' });
    expect(parseReturn('', '#/p/abc')).toEqual({});
  });

  it('PKCE: sfida S256 in base64url', async () => {
    const v = 'dBjftJeZ4CVP-mB92K92KH4u6evNs7Kjnig9sHAU_BI~.x';
    expect(await pkceChallenge(v)).toBe(createHash('sha256').update(v).digest('base64url'));
  });
});
