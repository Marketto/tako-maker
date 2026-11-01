import { analyze, type AnalysisReport } from '../core/analysis';
import { applyOps, type DesignOp } from '../core/design/ops';
import { evaluateInWorker } from '../core/geometry/engine';
import { tolerancesByPart } from '../core/calibration/tolerances';
import { buildCalibrationFiles, type CalibrationFiles } from '../core/calibration/export';
import { applyTestValue, type TestKind } from '../core/calibration/coupons';
import { downloadBlob } from './download';
import type { PartResult, RawMesh } from '../core/geometry/evaluate';
import { importModelFile } from '../core/geometry/import';
import { planAssembly, type AssemblyPlan } from '../core/assembly/plan';
import { build3MF, flavorForSlicer } from '../core/export/threemf';
import { buildSTLZip } from '../core/export/stl';
import { bedOf } from '../core/analysis/estimate';
import type { Design, Question } from '../core/types';
import { Budget } from '../agent/budget';
import type { AiClient } from '../agent/client';
import { KeyRouter } from '../agent/providers/keyRouter';
import { LIMITS } from '../agent/config';
import { route } from '../agent/router';
import { resumeAgent, runAgent, type AgentState, type RunInput } from '../agent/runner';
import { SKILLS, type SkillName } from '../agent/skills';
import type { SearchResult, ToolEnv } from '../agent/tools';
import type { ImportedMeshInfo } from '../agent/context';
import { cachedSearch, loadMesh, printerById, saveMesh, saveProject, store, storeSearch, uid, type ChatItem, type Project } from './store';
import { t } from '../i18n';
import { shoppingListText } from '../core/hardware';
import { printedTogether } from '../core/design/links';

/* Orchestratore di un progetto aperto: collega UI, router, agente,
   geometria (worker) e analisi locali. La UI si limita a leggere lo snapshot. */

export interface Snapshot {
  project: Project;
  parts: PartResult[];
  geometryErrors: string[];
  report: AnalysisReport | null;
  assembly: AssemblyPlan | null;
  questions: Question[];
  busy: string | null;
  error: string | null;
  meshInfo: ImportedMeshInfo[];
}

let router: KeyRouter | null = null;
/** Client AI condiviso: router delle chiavi con fallback tra provider. */
export function makeClient(): KeyRouter {
  const s = store.get();
  router = new KeyRouter(() => store.get().keys, localStorage, new Budget(localStorage, s.settings.monthlyCapUsd));
  return router;
}

export const LICENSE_NO_DERIVATIVES = /\bND\b|no[\s-]?deriv|non opere derivate|standard digital file/i;

export class ProjectSession {
  private snap: Snapshot;
  private listeners = new Set<() => void>();
  private meshes: Record<string, RawMesh> = {};
  private pendingAgent: { question: Question; state: AgentState } | null = null;
  private abort: AbortController | null = null;
  private evalSeq = 0;

  private constructor(project: Project) {
    this.snap = { project, parts: [], geometryErrors: [], report: null, assembly: null, questions: [], busy: null, error: null, meshInfo: [] };
  }

  static async open(project: Project): Promise<ProjectSession> {
    const s = new ProjectSession(project);
    for (const id of project.meshIds) {
      const m = await loadMesh(id);
      if (m) s.meshes[id] = m.mesh;
    }
    await s.refresh();
    return s;
  }

  subscribe = (l: () => void) => {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  };
  getSnapshot = () => this.snap;
  private set(patch: Partial<Snapshot>) {
    this.snap = { ...this.snap, ...patch };
    this.listeners.forEach((l) => l());
  }

  private get setup() {
    return store.get().setup!;
  }
  private get printer() {
    return printerById(this.setup.printerId);
  }

  /* ---------- Geometria e analisi ---------- */

  private async evaluate(d: Design) {
    const r = await evaluateInWorker(d, this.meshes, tolerancesByPart(d, this.setup));
    return r;
  }

  async refresh() {
    const seq = ++this.evalSeq;
    const d = this.snap.project.design;
    if (!d.parts.length) {
      this.set({ parts: [], report: null, assembly: null, questions: this.pendingAgent ? [this.pendingAgent.question] : [], geometryErrors: [] });
      return;
    }
    try {
      const r = await this.evaluate(d);
      if (seq !== this.evalSeq) return; // nel frattempo è arrivata una modifica più recente
      const report = analyze(d, r.parts, this.setup, this.printer, new Set(this.snap.project.answered), { connectors: r.connectors, overlaps: r.overlaps, buttons: r.buttons });
      const assembly = d.printPlan.strategy === 'separate' ? planAssembly(d, r.parts.map((p) => ({ id: p.id, box: p.contactBox })), d.printPlan.connection, r.connectors) : null;
      const meshInfo = this.snap.project.meshIds.map((id) => {
        const part = r.parts.find((p) => d.parts.find((x) => x.id === p.id)?.shape.op === 'mesh' && (d.parts.find((x) => x.id === p.id)!.shape as { ref: string }).ref === id);
        const size = part ? ([0, 1, 2].map((k) => part.bbox.max[k] - part.bbox.min[k]) as [number, number, number]) : ([0, 0, 0] as [number, number, number]);
        return { id, name: part?.name ?? id, size, manifold: part?.manifold ?? true };
      });
      this.set({
        parts: r.parts,
        geometryErrors: r.errors,
        report,
        assembly,
        meshInfo,
        questions: [...(this.pendingAgent ? [this.pendingAgent.question] : []), ...report.questions],
      });
    } catch (e) {
      this.set({ error: t('Errore nel calcolo della geometria: {error}', { error: (e as Error).message }) });
    }
  }

  private async persist(project: Project) {
    this.set({ project });
    await saveProject(project);
  }

  private async commitDesign(design: Design) {
    const p = this.snap.project;
    await this.persist({ ...p, design, name: design.name || p.name, undo: [...p.undo, p.design].slice(-20) });
    await this.refresh();
  }

  async applyLocal(ops: DesignOp[]) {
    try {
      const next = applyOps(this.snap.project.design, ops, new Set(this.setup.filaments.map((f) => f.id)));
      await this.commitDesign(next);
    } catch (e) {
      this.set({ error: (e as Error).message });
    }
  }

  async undo() {
    const p = this.snap.project;
    const prev = p.undo.at(-1);
    if (!prev) return;
    await this.persist({ ...p, design: prev, undo: p.undo.slice(0, -1) });
    await this.refresh();
  }

  /* ---------- Chat e agente ---------- */

  private async pushChat(item: Omit<ChatItem, 'id'>) {
    const p = this.snap.project;
    await this.persist({ ...p, chat: [...p.chat, { id: uid(), ...item }] });
  }

  private env(): ToolEnv {
    return {
      design: () => this.snap.project.design,
      commit: (d) => {
        const p = this.snap.project;
        this.snap = { ...this.snap, project: { ...p, design: d, name: d.name || p.name, undo: [...p.undo, p.design].slice(-20) } };
        void saveProject(this.snap.project);
        void this.refresh();
      },
      setup: this.setup,
      printer: this.printer,
      evaluate: async (d) => {
        const r = await this.evaluate(d);
        return { parts: r.parts, errors: r.errors, connectors: r.connectors, overlaps: r.overlaps, buttons: r.buttons };
      },
      analyze: (d, parts, extras) => analyze(d, parts, this.setup, this.printer, new Set(this.snap.project.answered), extras),
    };
  }

  private baseInput(skill: SkillName, client: AiClient): Omit<RunInput, 'text' | 'history'> {
    this.abort = new AbortController();
    return {
      skill: SKILLS[skill],
      env: this.env(),
      client,
      economy: store.get().settings.economy,
      meshes: this.snap.meshInfo,
      report: this.snap.report ?? undefined,
      reference: this.snap.project.reference,
      signal: this.abort.signal,
      onEvent: (e) => this.set({ busy: e.label }),
    };
  }

  async send(text: string, force?: SkillName) {
    text = text.trim();
    if (!text || this.snap.busy) return;
    this.set({ error: null });
    const history = this.snap.project.chat.map((c) => ({ role: c.role, text: c.text })).filter((t) => t.text);
    await this.pushChat({ role: 'user', text });
    const client = makeClient();
    if (!client.isConfigured()) {
      this.set({ error: t('Per usare l’assistente aggiungi una chiave AI (Claude, GPT o Gemini) nelle impostazioni (icona ⚙).') });
      return;
    }
    this.set({ busy: t('Capisco cosa ti serve…') });
    try {
      const s = store.get().settings;
      const decision = force
        ? { skill: force, hints: {} as { children?: boolean } }
        : await route(text, this.snap.project.design, { searchFirst: s.searchFirst, smartRouting: s.smartRouting, client });
      if (decision.hints.children && !this.snap.project.design.intendedUse.children) {
        await this.applyLocal([{ op: 'set_meta', children: true }]);
      }
      if (decision.skill === 'cerca-modelli') {
        const cached = await cachedSearch(text, LIMITS.searchCacheDays);
        if (cached) {
          await this.pushChat({ role: 'assistant', text: t('Ecco i modelli trovati (ricerca già fatta di recente, nessun costo):'), results: cached, skill: decision.skill, costUsd: 0 });
          return;
        }
      }
      const out = await runAgent({ ...this.baseInput(decision.skill, client), text, history });
      await this.handleOutcome(out, decision.skill, text);
    } catch (e) {
      if ((e as Error).name !== 'AbortError') this.set({ error: (e as Error).message });
    } finally {
      this.set({ busy: null });
    }
  }

  private async handleOutcome(out: Awaited<ReturnType<typeof runAgent>>, skill: SkillName, query?: string) {
    if (out.results) {
      if (query && out.results.length) await storeSearch(query, out.results);
      await this.pushChat({
        role: 'assistant',
        text: out.results.length ? out.text || t('Ecco cosa ho trovato. Scegline uno oppure chiedimi di crearlo da zero.') : t('Non ho trovato modelli con licenza adatta. Vuoi che lo crei da zero?'),
        results: out.results,
        skill,
        costUsd: out.costUsd,
      });
    } else if (out.text || !out.question) {
      await this.pushChat({ role: 'assistant', text: out.text || t('Fatto.'), skill, costUsd: out.costUsd });
    }
    if (out.question && out.state) {
      this.pendingAgent = { question: out.question, state: out.state };
      await this.refresh();
    }
  }

  stop() {
    this.abort?.abort();
  }

  /** Risposta a una domanda (analisi locale = zero token, agente = riprende il ciclo). */
  async answer(q: Question, selected: string[]) {
    const chosen = q.options.filter((o) => selected.includes(o.id));
    if (q.source === 'agent' && this.pendingAgent?.question.id === q.id) {
      const pending = this.pendingAgent;
      this.pendingAgent = null;
      const label = chosen.map((o) => o.label).join(', ') || 'nessuna preferenza';
      await this.pushChat({ role: 'user', text: label });
      const client = makeClient();
      this.set({ busy: t('Continuo…'), questions: this.snap.questions.filter((x) => x.id !== q.id) });
      try {
        const out = await resumeAgent(this.baseInput(pending.state.skill.name, client), pending.state, label);
        await this.handleOutcome(out, pending.state.skill.name);
      } catch (e) {
        this.set({ error: (e as Error).message });
      } finally {
        this.set({ busy: null });
      }
      return;
    }
    const ops = [...(q.baseOps ?? []), ...chosen.flatMap((o) => o.ops ?? [])];
    const ai = chosen.find((o) => o.action === 'ask_ai' && o.prompt);
    if (ai) {
      if (!makeClient().isConfigured()) {
        this.set({ error: t('Per usare l’assistente aggiungi una chiave AI (Claude, GPT o Gemini) nelle impostazioni (icona ⚙).') });
        return;
      }
      const p0 = this.snap.project;
      await this.persist({ ...p0, answered: [...p0.answered, q.key] });
      if (ops.length) await this.applyLocal(ops);
      await this.send(ai.prompt!, 'modifica-modello');
      return;
    }
    if (chosen.some((o) => o.action === 'calibration')) {
      const p0 = this.snap.project;
      await this.persist({ ...p0, answered: [...p0.answered, q.key] });
      await this.downloadCalibration();
      return;
    }
    const p = this.snap.project;
    await this.persist({ ...p, answered: [...p.answered, q.key] });
    if (ops.length) await this.applyLocal(ops);
    else await this.refresh();
  }

  async useAsInspiration(r: SearchResult) {
    const p = this.snap.project;
    await this.persist({ ...p, reference: r });
    await this.send(t('Crea un modello ispirato a "{title}": {summary}', { title: r.title, summary: r.summary }), 'crea-modello');
  }

  async importFile(file: File, r?: SearchResult) {
    if (r && LICENSE_NO_DERIVATIVES.test(r.license)) {
      this.set({ error: t('La licenza di questo modello non permette modifiche: puoi usarlo solo come ispirazione.') });
      return;
    }
    this.set({ busy: t('Importo il file…'), error: null });
    try {
      const mesh = await importModelFile(file);
      const id = `m${uid()}`;
      await saveMesh({ id, name: file.name, mesh });
      this.meshes[id] = mesh;
      const p = this.snap.project;
      const partId = `importato-${p.meshIds.length + 1}`;
      const design: Design = structuredClone(p.design);
      design.parts.push({ id: partId, name: file.name.replace(/\.(stl|3mf)$/i, ''), filamentId: this.setup.filaments[0]?.id, shape: { op: 'mesh', ref: id } });
      if (r) design.source = { kind: 'remix', title: r.title, url: r.url, author: r.author, license: r.license };
      if (!design.name || design.name === t('Nuovo modello')) design.name = r?.title ?? file.name;
      await this.persist({ ...p, meshIds: [...p.meshIds, id] });
      await this.commitDesign(design);
      await this.pushChat({ role: 'assistant', text: t('Ho importato "{file}". Ora puoi chiedermi delle modifiche.', { file: file.name }) });
    } catch (e) {
      this.set({ error: (e as Error).message });
    } finally {
      this.set({ busy: null });
    }
  }

  /* ---------- Esportazione ---------- */

  private exportParts() {
    const fil = this.setup.filaments;
    const groups = jointGroups(this.snap.project.design);
    return this.snap.parts.map((p) => {
      const f = fil.find((x) => x.id === p.filamentId);
      return { name: p.name, mesh: p.mesh, filament: f, extruder: f ? fil.indexOf(f) + 1 : 1, group: groups.get(p.id) };
    });
  }

  /** Genera e scarica i campioni di prova (un piatto per materiale). */
  async downloadCalibration(): Promise<CalibrationFiles | null> {
    this.set({ busy: t('Preparo i campioni di prova…'), error: null });
    try {
      const files = await buildCalibrationFiles(this.snap.project.design, this.setup, this.printer, async (d, tol) => (await evaluateInWorker(d, {}, tol)).parts);
      downloadBlob(new Blob([files.data as BlobPart], { type: files.mime }), files.filename);
      await this.pushChat({
        role: 'assistant',
        text:
          `${files.plates === 1 ? t('Ecco i campioni di prova: 1 piatto ({materials}).', { materials: files.materials.join(', ') }) : t('Ecco i campioni di prova: {n} piatti ({materials}).', { n: files.plates, materials: files.materials.join(', ') })} ` +
          t('Ogni campione ha da 1 a 5 puntini: dopo la stampa prova quale funziona meglio e indicalo nella scheda Stampa → Campioni di prova.') +
          '\n\n' +
          files.readme
            .split('\n')
            .filter((l) => /^ {2}●|^---|: /.test(l) && !/^Poi|^CAMPIONI/.test(l))
            .slice(0, 16)
            .join('\n'),
      });
      return files;
    } catch (e) {
      this.set({ error: (e as Error).message });
      return null;
    } finally {
      this.set({ busy: null });
    }
  }

  /** Salva la tolleranza scelta dopo aver provato i campioni e ricalcola il modello. */
  async saveCalibration(material: string, kind: TestKind, value: number) {
    const setup = this.setup;
    const tolerances = { ...(setup.tolerances ?? {}) };
    tolerances[material] = { ...(tolerances[material] ?? {}), ...applyTestValue(kind, value) };
    store.setSetup({ ...setup, tolerances });
    await this.refresh();
  }

  private shoppingFiles(dir: string): Record<string, string> {
    const text = shoppingListText(this.snap.project.design);
    return text ? { [`${dir}DA-ACQUISTARE.txt`]: text } : {};
  }

  export3MF(): { blob: Blob; filename: string } {
    const d = this.snap.project.design;
    const data = build3MF(this.exportParts(), {
      title: d.name,
      flavor: flavorForSlicer(this.printer.slicer),
      strategy: d.printPlan.strategy,
      bed: bedOf(this.setup, this.printer),
      attribution: d.source,
      extraFiles: this.shoppingFiles('Metadata/'),
    });
    return { blob: new Blob([data as BlobPart], { type: 'model/3mf' }), filename: `${slug(d.name)}.3mf` };
  }

  exportSTL(): { blob: Blob; filename: string } {
    const d = this.snap.project.design;
    const data = buildSTLZip(this.exportParts(), d.source, this.shoppingFiles(''));
    return { blob: new Blob([data as BlobPart], { type: 'application/zip' }), filename: `${slug(d.name)}-stl.zip` };
  }
}

/** Parti collegate da cerniere/perni stampati già montati (union-find semplice). */
export function jointGroups(d: Design): Map<string, string> {
  const parent = new Map<string, string>();
  const find = (x: string): string => (parent.get(x) ?? x) === x ? x : find(parent.get(x)!);
  const pairs = printedTogether(d);
  for (const [a, b] of pairs) parent.set(find(b), find(a));
  const out = new Map<string, string>();
  for (const p of d.parts) if (pairs.some(([a, b]) => a === p.id || b === p.id)) out.set(p.id, find(p.id));
  return out;
}

const slug = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'modello';
