import { useSyncExternalStore } from 'react';
import { listProjects, loadMesh, loadProject, onProjectChange, restoreProject, store, type StoredMesh } from '../store';
import { decodeIndex, decodeProject, encodeIndex, encodeProject, entryOf, INDEX_FILE, PROJECT_EXT, projectFile, reconcile, toDownload, withEntry, type CloudIndex, type IndexEntry } from './archive';
import { accessToken, beginAuth, completeAuth, loadTokens, saveTokens } from './auth';
import { CloudAuthError, dropboxDrive, gdriveDrive, type CloudDrive, type CloudKind } from './drives';

/* Salvataggio facoltativo dei progetti nel cloud dell'utente (Dropbox o Google Drive).
   Ogni progetto salvato viene caricato dopo qualche secondo; all'avvio si scaricano i
   progetti che mancano o sono più recenti nel cloud (anche dopo aver pulito il browser). */

export type { CloudKind } from './drives';

const IDS: Partial<Record<CloudKind, string>> = {
  dropbox: (import.meta.env.VITE_DROPBOX_APP_KEY as string | undefined) || undefined,
  gdrive: (import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined) || undefined,
};

/** Provider disponibili in questa build (serve l'id dell'app registrata). */
export const cloudKinds = (): CloudKind[] => (['dropbox', 'gdrive'] as const).filter((k) => !!IDS[k]);
export const CLOUD_NAME: Record<CloudKind, string> = { dropbox: 'Dropbox', gdrive: 'Google Drive' };

export interface CloudSnapshot {
  kind: CloudKind | null;
  /** off: non collegato; auth: va ricollegato; error: ultimo tentativo fallito (si riprova). */
  status: 'off' | 'idle' | 'busy' | 'auth' | 'error';
  error: string | null;
  /** Progetti presenti nel cloud. */
  entries: IndexEntry[];
  lastSync: number | null;
  /** Progetti non ancora caricati. */
  pending: number;
}

const PENDING = 'm3d.cloud.pending';
const SETUP_KEY = '__setup__';

class CloudSync {
  private snap: CloudSnapshot = { kind: null, status: 'off', error: null, entries: [], lastSync: null, pending: 0 };
  private listeners = new Set<() => void>();
  private queue: Promise<void> = Promise.resolve();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private pending = new Set<string>();
  private started = false;

  get = () => this.snap;
  subscribe = (l: () => void) => {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  };
  private set(patch: Partial<CloudSnapshot>) {
    this.snap = { ...this.snap, ...patch, pending: this.pending.size };
    this.listeners.forEach((l) => l());
  }

  private drive(): CloudDrive | null {
    const kind = this.snap.kind;
    if (!kind) return null;
    const token = () => accessToken(IDS);
    return kind === 'dropbox' ? dropboxDrive(token) : gdriveDrive(token);
  }

  /** All'avvio: completa un collegamento in corso e scarica le novità. */
  async init(): Promise<string | null> {
    if (this.started) return null;
    this.started = true;
    try {
      this.pending = new Set(JSON.parse(localStorage.getItem(PENDING) ?? '[]') as string[]);
    } catch {
      this.pending = new Set();
    }
    let error: string | null = null;
    const done = await completeAuth(IDS).catch((e: Error) => ({ error: e.message }));
    if (done && 'error' in done) error = done.error;
    onProjectChange((e) => (e.type === 'saved' ? this.markDirty(e.id) : void this.removeRemote(e.id)));
    let setupSig = JSON.stringify(store.get().setup);
    store.subscribe(() => {
      const sig = JSON.stringify(store.get().setup);
      if (sig !== setupSig && store.get().setup) this.markDirty(SETUP_KEY);
      setupSig = sig;
    });
    const t = loadTokens();
    if (t && IDS[t.kind]) {
      this.set({ kind: t.kind, status: 'idle', error });
      void this.refresh();
    } else if (error) this.set({ error });
    return error;
  }

  async connect(kind: CloudKind) {
    const id = IDS[kind];
    if (id) await beginAuth(kind, id);
  }

  reconnect() {
    return this.snap.kind ? this.connect(this.snap.kind) : Promise.resolve();
  }

  disconnect() {
    saveTokens(null);
    this.pending.clear();
    this.savePending();
    this.set({ kind: null, status: 'off', error: null, entries: [], lastSync: null });
  }

  private savePending() {
    localStorage.setItem(PENDING, JSON.stringify([...this.pending]));
  }

  /** Un progetto (o la configurazione) è cambiato: lo carico tra poco. */
  markDirty(id: string) {
    if (!this.snap.kind) return;
    this.pending.add(id);
    this.savePending();
    this.set({});
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.flush(), 4000);
  }

  /** Esegue un'operazione alla volta e traduce gli errori nello stato. */
  private run(task: (d: CloudDrive) => Promise<void>): Promise<void> {
    this.queue = this.queue.then(async () => {
      const d = this.drive();
      if (!d || this.snap.status === 'auth') return;
      this.set({ status: 'busy' });
      try {
        await task(d);
        this.set({ status: 'idle', error: null, lastSync: Date.now() });
      } catch (e) {
        if (e instanceof CloudAuthError) this.set({ status: 'auth', error: null });
        else this.set({ status: 'error', error: (e as Error).message });
      }
    });
    return this.queue;
  }

  private async updateIndex(d: CloudDrive, change: (i: CloudIndex) => CloudIndex) {
    const next = change(decodeIndex(await d.read(INDEX_FILE)));
    await d.write(INDEX_FILE, encodeIndex(next));
    this.set({ entries: next.projects });
  }

  /** Carica i progetti cambiati e aggiorna l'indice. */
  flush() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    return this.run(async (d) => {
      const ids = [...this.pending];
      if (!ids.length) return;
      const entries: { id: string; entry: IndexEntry | null }[] = [];
      for (const id of ids) {
        if (id === SETUP_KEY) continue;
        const p = await loadProject(id);
        if (!p) {
          entries.push({ id, entry: null });
          continue;
        }
        await d.write(projectFile(id), encodeProject(p, await meshesOf(p.meshIds)));
        entries.push({ id, entry: entryOf(p) });
      }
      const setup = store.get().setup;
      await this.updateIndex(d, (i) => entries.reduce((acc, e) => withEntry(acc, e.id, e.entry), setup ? { ...i, setup } : i));
      for (const id of ids) this.pending.delete(id);
      this.savePending();
    });
  }

  private removeRemote(id: string) {
    this.pending.delete(id);
    this.savePending();
    return this.run(async (d) => {
      await d.remove(projectFile(id));
      await this.updateIndex(d, (i) => withEntry(i, id, null));
    });
  }

  /** Scarica i progetti nuovi o più recenti nel cloud; prepara il caricamento di quelli solo locali. */
  refresh() {
    return this.run(async (d) => {
      const files = await d.list();
      const index = reconcile(decodeIndex(await d.read(INDEX_FILE)), files.map((f) => f.name).filter((n) => n.endsWith(PROJECT_EXT)));
      const local = await listProjects();
      for (const e of toDownload(index, local, this.pending)) {
        const data = await d.read(projectFile(e.id));
        if (!data) continue;
        const { project, meshes } = decodeProject(data);
        await restoreProject(project, meshes);
      }
      if (!store.get().setup && index.setup) store.setSetup(index.setup);
      const inCloud = new Map(index.projects.map((e) => [e.id, e.updatedAt]));
      for (const p of local) if (!inCloud.has(p.id) || p.updatedAt > inCloud.get(p.id)!) this.pending.add(p.id);
      this.savePending();
      this.set({ entries: index.projects });
      if (this.pending.size && !this.timer) this.timer = setTimeout(() => void this.flush(), 500);
    });
  }
}

async function meshesOf(ids: string[]): Promise<StoredMesh[]> {
  return (await Promise.all(ids.map((id) => loadMesh(id)))).filter(Boolean) as StoredMesh[];
}

export const cloud = new CloudSync();

export function useCloud(): CloudSnapshot {
  return useSyncExternalStore(cloud.subscribe, cloud.get);
}

/* ---------- Backup su file (senza cloud) ---------- */

export { exportAll, exportOne, importFile } from './files';
