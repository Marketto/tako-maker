import { unzipSync, zipSync } from 'fflate';
import { listProjects, loadMesh, loadProject, restoreProject, store, type StoredMesh } from '../store';
import { decodeIndex, decodeProject, emptyIndex, encodeIndex, encodeProject, entryOf, INDEX_FILE, PROJECT_EXT, projectFile } from './archive';

/* Backup su file, senza cloud: un archivio .zip con tutti i progetti (stesso formato
   dei file nel cloud) e la configurazione; si ripristina anche un singolo .printopus. */

export async function exportAll(): Promise<Blob> {
  const files: Record<string, Uint8Array> = {};
  const index = { ...emptyIndex(), setup: store.get().setup ?? undefined, projects: [] as ReturnType<typeof entryOf>[] };
  for (const p of await listProjects()) {
    const meshes = (await Promise.all(p.meshIds.map((id) => loadMesh(id)))).filter(Boolean) as StoredMesh[];
    files[projectFile(p.id)] = encodeProject(p, meshes);
    index.projects.push(entryOf(p));
  }
  files[INDEX_FILE] = encodeIndex(index);
  return new Blob([zipSync(files, { level: 0 }) as BlobPart], { type: 'application/zip' });
}

export async function exportOne(id: string): Promise<Blob | null> {
  const p = await loadProject(id);
  if (!p) return null;
  const meshes = (await Promise.all(p.meshIds.map((m) => loadMesh(m)))).filter(Boolean) as StoredMesh[];
  return new Blob([encodeProject(p, meshes) as BlobPart], { type: 'application/octet-stream' });
}

/** Ripristina da un file: tiene la versione locale se è più recente. Restituisce quanti progetti ha importato. */
export async function importFile(file: Blob): Promise<number> {
  const data = new Uint8Array(await file.arrayBuffer());
  const isZip = data[0] === 0x50 && data[1] === 0x4b;
  const entries: Uint8Array[] = [];
  if (isZip) {
    const all = unzipSync(data);
    const index = decodeIndex(all[INDEX_FILE] ?? null);
    if (!store.get().setup && index.setup) store.setSetup(index.setup);
    for (const [name, bytes] of Object.entries(all)) if (name.endsWith(PROJECT_EXT)) entries.push(bytes);
  } else entries.push(data);
  const local = new Map((await listProjects()).map((p) => [p.id, p.updatedAt]));
  let n = 0;
  for (const bytes of entries) {
    const { project, meshes } = decodeProject(bytes);
    if ((local.get(project.id) ?? -1) > project.updatedAt) continue;
    await restoreProject(project, meshes, true);
    n++;
  }
  return n;
}
