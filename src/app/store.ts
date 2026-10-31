import { useSyncExternalStore } from 'react';
import { get, set, del, keys } from 'idb-keyval';
import printersData from '../data/printers.json';
import type { Design, PrinterSpec, UserSetup } from '../core/types';
import type { RawMesh } from '../core/geometry/evaluate';
import { DEFAULT_SETTINGS } from '../agent/config';
import type { ChatTurn } from '../agent/runner';
import type { SearchResult } from '../agent/tools';

/* Stato persistente. Tutto resta sul dispositivo dell'utente:
   - localStorage: configurazione, impostazioni, (opzionale) chiave API
   - sessionStorage: chiave API se l'utente non vuole ricordarla
   - IndexedDB: progetti, mesh importate, cache delle ricerche */

export const PRINTERS = printersData.printers as unknown as PrinterSpec[];
export const printerById = (id: string) => PRINTERS.find((p) => p.id === id) ?? PRINTERS[PRINTERS.length - 1];

export type Settings = typeof DEFAULT_SETTINGS & {
  searchFirst: boolean;
  accessCode: string;
  rememberKey: boolean;
};

interface AppState {
  setup: UserSetup | null;
  settings: Settings;
  apiKey: string;
}

const LS = { setup: 'm3d.setup', settings: 'm3d.settings', key: 'm3d.apikey' };

function load(): AppState {
  const parse = <T,>(k: string): T | null => {
    try {
      return JSON.parse(localStorage.getItem(k) ?? 'null') as T;
    } catch {
      return null;
    }
  };
  const settings = { ...DEFAULT_SETTINGS, searchFirst: true, accessCode: '', rememberKey: true, ...(parse<Partial<Settings>>(LS.settings) ?? {}) };
  return {
    setup: parse<UserSetup>(LS.setup),
    settings,
    apiKey: localStorage.getItem(LS.key) ?? sessionStorage.getItem(LS.key) ?? '',
  };
}

let state: AppState = load();
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export const store = {
  get: () => state,
  subscribe(l: () => void) {
    listeners.add(l);
    return () => listeners.delete(l);
  },
  setSetup(setup: UserSetup | null) {
    state = { ...state, setup };
    if (setup) localStorage.setItem(LS.setup, JSON.stringify(setup));
    else localStorage.removeItem(LS.setup);
    emit();
  },
  setSettings(patch: Partial<Settings>) {
    state = { ...state, settings: { ...state.settings, ...patch } };
    localStorage.setItem(LS.settings, JSON.stringify(state.settings));
    if (patch.rememberKey !== undefined) store.setApiKey(state.apiKey);
    emit();
  },
  setApiKey(key: string) {
    state = { ...state, apiKey: key.trim() };
    localStorage.removeItem(LS.key);
    sessionStorage.removeItem(LS.key);
    if (state.apiKey) (state.settings.rememberKey ? localStorage : sessionStorage).setItem(LS.key, state.apiKey);
    emit();
  },
};

export function useStore(): AppState {
  return useSyncExternalStore(store.subscribe, store.get);
}

/* ---------- Progetti ---------- */

export interface ChatItem extends ChatTurn {
  id: string;
  costUsd?: number;
  results?: SearchResult[];
  skill?: string;
}

export interface Project {
  id: string;
  name: string;
  design: Design;
  undo: Design[];
  chat: ChatItem[];
  answered: string[];
  meshIds: string[];
  reference?: SearchResult;
  createdAt: number;
  updatedAt: number;
}

const P = (id: string) => `project:${id}`;
const M = (id: string) => `mesh:${id}`;

export async function listProjects(): Promise<Project[]> {
  const ks = (await keys()).filter((k) => String(k).startsWith('project:'));
  const all = await Promise.all(ks.map((k) => get<Project>(k)));
  return (all.filter(Boolean) as Project[]).sort((a, b) => b.updatedAt - a.updatedAt);
}
export const loadProject = (id: string) => get<Project>(P(id));
export const saveProject = (p: Project) => set(P(p.id), { ...p, updatedAt: Date.now() });
export async function deleteProject(p: Project) {
  await Promise.all(p.meshIds.map((m) => del(M(m))));
  await del(P(p.id));
}

export interface StoredMesh {
  id: string;
  name: string;
  mesh: RawMesh;
}
export const saveMesh = (m: StoredMesh) => set(M(m.id), m);
export const loadMesh = (id: string) => get<StoredMesh>(M(id));

/* ---------- Cache delle ricerche ---------- */

export async function cachedSearch(query: string, maxAgeDays: number): Promise<SearchResult[] | null> {
  const hit = await get<{ at: number; results: SearchResult[] }>(`search:${normalizeQuery(query)}`);
  if (!hit || Date.now() - hit.at > maxAgeDays * 86400_000) return null;
  return hit.results;
}
export const storeSearch = (query: string, results: SearchResult[]) => set(`search:${normalizeQuery(query)}`, { at: Date.now(), results });
export const normalizeQuery = (q: string) => q.toLowerCase().replace(/[^\p{L}\p{N} ]/gu, ' ').replace(/\s+/g, ' ').trim();

export const uid = () => Math.random().toString(36).slice(2, 10);
