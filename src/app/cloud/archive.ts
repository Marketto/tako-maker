import { gunzipSync, gzipSync, strFromU8, strToU8 } from 'fflate';
import type { UserSetup } from '../../core/types';
import { msg } from '../../i18n';
import type { Project, StoredMesh } from '../store';

/* Formato dei file di backup (cloud o file scaricato): JSON compresso con gzip.
   Un file per progetto, con le mesh importate; un indice con nomi e date per
   mostrare l'elenco senza scaricare ogni progetto. */

export const PROJECT_FORMAT = 'printopus-progetto';
export const INDEX_FORMAT = 'printopus-indice';
export const INDEX_FILE = 'progetti.json';
export const PROJECT_EXT = '.printopus';
export const projectFile = (id: string) => `${id}${PROJECT_EXT}`;

interface EncodedMesh {
  id: string;
  name: string;
  positions: string;
  indices: string;
}

interface ProjectArchive {
  format: typeof PROJECT_FORMAT;
  version: 1;
  project: Project;
  meshes: EncodedMesh[];
}

export interface IndexEntry {
  id: string;
  name: string;
  parts: number;
  updatedAt: number;
}

export interface CloudIndex {
  format: typeof INDEX_FORMAT;
  version: 1;
  /** Stampante e filamenti, per ripristinarli su un dispositivo nuovo. */
  setup?: UserSetup;
  projects: IndexEntry[];
}

export const emptyIndex = (): CloudIndex => ({ format: INDEX_FORMAT, version: 1, projects: [] });

/* ---------- base64 per gli array delle mesh ---------- */

function toBase64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

function fromBase64(b64: string): Uint8Array {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

const bytesOf = (a: Float32Array | Uint32Array) => new Uint8Array(a.buffer, a.byteOffset, a.byteLength);

/* ---------- progetto ---------- */

export function encodeProject(project: Project, meshes: StoredMesh[]): Uint8Array {
  const archive: ProjectArchive = {
    format: PROJECT_FORMAT,
    version: 1,
    project,
    meshes: meshes.map((m) => ({ id: m.id, name: m.name, positions: toBase64(bytesOf(m.mesh.positions)), indices: toBase64(bytesOf(m.mesh.indices)) })),
  };
  return gzipSync(strToU8(JSON.stringify(archive)));
}

/** Legge un file di progetto; errore con un messaggio chiaro se non è un file di Printopus. */
export function decodeProject(data: Uint8Array): { project: Project; meshes: StoredMesh[] } {
  let archive: ProjectArchive;
  try {
    archive = JSON.parse(strFromU8(gunzipSync(data))) as ProjectArchive;
  } catch {
    throw new Error(msg('Il file non è leggibile.'));
  }
  const p = archive?.project;
  if (archive?.format !== PROJECT_FORMAT || !p || typeof p.id !== 'string' || !p.design || !Array.isArray(p.design.parts)) throw new Error(msg('Non è un progetto di Printopus.'));
  const meshes = (archive.meshes ?? []).map((m) => {
    const pos = fromBase64(m.positions);
    const idx = fromBase64(m.indices);
    return { id: m.id, name: m.name, mesh: { positions: new Float32Array(pos.buffer, 0, pos.byteLength / 4), indices: new Uint32Array(idx.buffer, 0, idx.byteLength / 4) } };
  });
  return { project: { ...p, chat: p.chat ?? [], undo: p.undo ?? [], answered: p.answered ?? [], meshIds: p.meshIds ?? [] }, meshes };
}

/* ---------- indice ---------- */

export function encodeIndex(index: CloudIndex): Uint8Array {
  return strToU8(JSON.stringify(index));
}

export function decodeIndex(data: Uint8Array | null): CloudIndex {
  if (!data) return emptyIndex();
  try {
    const x = JSON.parse(strFromU8(data)) as CloudIndex;
    if (x?.format === INDEX_FORMAT && Array.isArray(x.projects)) return x;
  } catch {
    /* indice rovinato: si ricostruisce */
  }
  return emptyIndex();
}

export const entryOf = (p: Project): IndexEntry => ({ id: p.id, name: p.name, parts: p.design.parts.length, updatedAt: p.updatedAt });

/** Aggiorna o toglie una voce dell'indice (ordine: più recenti prima). */
export function withEntry(index: CloudIndex, id: string, entry: IndexEntry | null): CloudIndex {
  const projects = index.projects.filter((e) => e.id !== id);
  if (entry) projects.push(entry);
  projects.sort((a, b) => b.updatedAt - a.updatedAt);
  return { ...index, projects };
}

/** Tiene solo le voci che hanno davvero un file nel cloud. */
export function reconcile(index: CloudIndex, files: string[]): CloudIndex {
  const have = new Set(files);
  return { ...index, projects: index.projects.filter((e) => have.has(projectFile(e.id))) };
}

/** Cosa scaricare: progetti solo nel cloud o più recenti lì (salvo modifiche locali non ancora caricate). */
export function toDownload(index: CloudIndex, local: { id: string; updatedAt: number }[], pending: Set<string>): IndexEntry[] {
  const byId = new Map(local.map((p) => [p.id, p.updatedAt]));
  return index.projects.filter((e) => !pending.has(e.id) && (!byId.has(e.id) || e.updatedAt > byId.get(e.id)!));
}
