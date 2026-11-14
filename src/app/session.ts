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
import { build3MF, flavorForSlicer, slicerProfileFor } from '../core/export/threemf';
import { buildSTLZip } from '../core/export/stl';
import { bedOf } from '../core/analysis/estimate';
import { settleIslands } from '../core/geometry/islands';
import type { Design, Question } from '../core/types';
import { Budget, addTally, diffTally, estimateTokens, type EstimatedMode, type TokenTally } from '../agent/budget';
import type { AiClient } from '../agent/client';
import { KeyRouter } from '../agent/providers/keyRouter';
import { LIMITS } from '../agent/config';
import { route, routeByRules } from '../agent/router';
import { resumeAgent, runAgent, type AgentState, type RunInput } from '../agent/runner';
import { SKILLS, type SkillName } from '../agent/skills';
import { analysisText, runTool, type SearchResult, type ToolEnv } from '../agent/tools';
import type { ImportedMeshInfo } from '../agent/context';
import { cachedSearch, loadMesh, printerOf, saveMesh, saveProject, store, storeSearch, uid, type ChatItem, type Project } from './store';
import { localeInfo, t } from '../i18n';
import { shoppingListText } from '../core/hardware';
import { printedTogether } from '../core/design/links';
import { plateKeepFree } from '../core/plate';
import { buildManualPrompt, correctionPrompt, parseManualReply } from '../agent/manual';
import { createSession, getSession, postReport, putSession } from './connector';
import { designKey, type ConnectorReport, type ConnectorState } from '../connector/state';

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
  /** Modalità copia e incolla: richiesta pronta da copiare nella chat. */
  manual: ManualRequest | null;
}

export interface ManualRequest {
  prompt: string;
  skill: SkillName;
  /** Testo della richiesta originale (per le domande di seguito). */
  text: string;
  /** true se è una richiesta di correzione dopo una risposta non valida. */
  correction?: boolean;
  /** Consumo già contato per questa richiesta (una risposta incollata più volte conta una volta). */
  counted?: boolean;
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
  private pendingManual: { question: Question; skill: SkillName; text: string } | null = null;
  private abort: AbortController | null = null;
  private evalSeq = 0;

  private constructor(project: Project) {
    this.snap = { project, parts: [], geometryErrors: [], report: null, assembly: null, questions: [], busy: null, error: null, meshInfo: [], manual: null };
  }

  static async open(project: Project): Promise<ProjectSession> {
    const s = new ProjectSession(project);
    for (const id of project.meshIds) {
      const m = await loadMesh(id);
      if (m) s.meshes[id] = m.mesh;
    }
    await s.refresh();
    if (project.connector && store.get().settings.aiMode === 'connector') s.startSync();
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
    return printerOf(this.setup);
  }

  /* ---------- Geometria e analisi ---------- */

  private async evaluate(d: Design) {
    const r = await evaluateInWorker(d, this.meshes, tolerancesByPart(d, this.setup));
    return r;
  }

  async refresh() {
    const seq = ++this.evalSeq;
    const d = this.snap.project.design;
    const answered = this.snap.project.answered;
    if (!d.parts.length) {
      this.set({ parts: [], report: null, assembly: null, questions: this.pendingQuestions(), geometryErrors: [] });
      this.setConnectorReport({ key: designKey({ design: d, answered }), text: 'Il modello è vuoto.', questions: [], errors: [] });
      return;
    }
    try {
      const r = await this.evaluate(d);
      if (seq !== this.evalSeq) return; // nel frattempo è arrivata una modifica più recente
      const report = analyze(d, r.parts, this.setup, this.printer, new Set(answered), { connectors: r.connectors, overlaps: r.overlaps, buttons: r.buttons, printStats: r.printStats });
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
        questions: [...this.pendingQuestions(), ...report.questions],
      });
      this.setConnectorReport({ key: designKey({ design: d, answered }), text: analysisText(d, r.parts, this.setup, report), questions: report.questions, errors: r.errors });
    } catch (e) {
      this.set({ error: t('Errore nel calcolo della geometria: {error}', { error: (e as Error).message }) });
      if (seq === this.evalSeq) this.setConnectorReport({ key: designKey({ design: d, answered }), text: '', questions: [], errors: [(e as Error).message] });
    }
  }

  private pendingQuestions(): Question[] {
    return [...(this.pendingAgent ? [this.pendingAgent.question] : []), ...(this.pendingManual ? [this.pendingManual.question] : [])];
  }

  private async persist(project: Project) {
    this.set({ project });
    await saveProject(project);
    if (project.connector && this.syncSig(project) !== this.lastSynced) this.schedulePush();
  }

  /* ---------- Connettore: la chat dell'utente (es. Claude) fa da assistente ---------- */

  private syncTimer: ReturnType<typeof setInterval> | null = null;
  private pushTimer: ReturnType<typeof setTimeout> | null = null;
  private lastSynced = '';
  private syncing = false;
  /** Ultima analisi calcolata qui, da rimandare alla chat (il connettore non calcola la geometria). */
  private connectorReport: Omit<ConnectorReport, 'at'> | null = null;
  private reportSent = '';

  private setConnectorReport(r: Omit<ConnectorReport, 'at'>) {
    // Si tiene anche senza collegamento: se l'utente collega dopo, il primo pull la manda.
    this.connectorReport = r;
    void this.sendReport();
  }

  /** Manda l'analisi se riguarda il modello salvato nel connettore (altrimenti il connettore la rifiuta). */
  private async sendReport(force = false) {
    const c = this.snap.project.connector;
    const r = this.connectorReport;
    if (!c || !r || (!force && r.key === this.reportSent)) return;
    try {
      if (await postReport(c.code, r)) this.reportSent = r.key;
    } catch {
      /* rete assente: ci pensa il prossimo giro di pull */
    }
  }

  private syncSig(p: Project) {
    return JSON.stringify([p.design, p.answered]);
  }

  private connectorState() {
    const p = this.snap.project;
    const info = localeInfo();
    return { setup: this.setup, printer: this.printer, design: p.design, answered: p.answered, language: info.code, languageName: info.english };
  }

  /** Crea la sessione condivisa e restituisce il codice da dare alla chat. */
  async connect() {
    this.set({ busy: t('Preparo il collegamento…'), error: null });
    try {
      const { code, v } = await createSession(this.connectorState());
      this.lastSynced = this.syncSig(this.snap.project);
      await this.persist({ ...this.snap.project, connector: { code, v, notesAt: Date.now() } });
      this.startSync();
    } catch (e) {
      this.set({ error: t('Non riesco a raggiungere il connettore: {error}', { error: (e as Error).message }) });
    } finally {
      this.set({ busy: null });
    }
  }

  async disconnect() {
    this.stopSync();
    const { connector: _c, ...rest } = this.snap.project;
    await this.persist(rest);
  }

  startSync() {
    if (this.syncTimer || !this.snap.project.connector) return;
    this.lastSynced = this.syncSig(this.snap.project);
    this.syncTimer = setInterval(() => void this.pull(), 2500);
    void this.pull();
  }

  stopSync() {
    if (this.syncTimer) clearInterval(this.syncTimer);
    if (this.pushTimer) clearTimeout(this.pushTimer);
    this.syncTimer = this.pushTimer = null;
  }

  dispose() {
    this.stopSync();
  }

  /** Legge lo stato condiviso e applica le modifiche arrivate dalla chat. */
  async pull() {
    const c = this.snap.project.connector;
    if (!c || this.syncing || (typeof document !== 'undefined' && document.hidden)) return;
    this.syncing = true;
    try {
      const remote = await getSession(c.code);
      if (!remote) {
        this.stopSync();
        this.set({ error: t('Il collegamento con la chat è scaduto: premi «Collega alla chat» per crearne uno nuovo.') });
        return;
      }
      await this.trackConnectorUsage(remote);
      if (remote.v > c.v) await this.applyRemote(remote);
      // La chat aspetta l'analisi di questa versione: se manca e qui c'è, la si manda.
      else if (this.connectorReport && remote.report?.key !== this.connectorReport.key && designKey(remote) === this.connectorReport.key) await this.sendReport(true);
    } catch {
      /* rete assente: si riprova al prossimo giro */
    } finally {
      this.syncing = false;
    }
  }

  /** Il connettore somma i token scambiati con la chat: qui si conta solo la parte nuova. */
  private async trackConnectorUsage(remote: ConnectorState) {
    const c = this.snap.project.connector;
    if (!c || !remote.usage) return;
    const delta = diffTally(remote.usage, c.usageSeen);
    if (!delta.calls && !delta.inputTokens && !delta.outputTokens) return;
    await this.addUsage('connector', delta, 0, { connector: { ...c, usageSeen: remote.usage } });
  }

  private async applyRemote(remote: ConnectorState) {
    const p = this.snap.project;
    const c = p.connector!;
    const notes = remote.notes.filter((n) => n.at > c.notesAt);
    const chat = [...p.chat, ...notes.map((n) => ({ id: uid(), role: n.role, text: n.text, results: n.results, costUsd: 0 }))];
    const changed = JSON.stringify(remote.design) !== JSON.stringify(p.design);
    const next: Project = {
      ...p,
      design: remote.design,
      name: remote.design.name || p.name,
      undo: changed ? [...p.undo, p.design].slice(-20) : p.undo,
      answered: remote.answered,
      chat,
      connector: { ...c, v: remote.v, notesAt: Math.max(c.notesAt, ...remote.notes.map((n) => n.at)), linked: true },
    };
    this.lastSynced = this.syncSig(next);
    await this.persist(next);
    if (changed || notes.length) await this.refresh();
  }

  private schedulePush() {
    if (this.pushTimer) clearTimeout(this.pushTimer);
    this.pushTimer = setTimeout(() => void this.push(), 600);
  }

  /** Manda alla chat le modifiche fatte nell'app (risposte alle domande, colori, annulla…). */
  private async push() {
    const p = this.snap.project;
    const c = p.connector;
    if (!c || this.syncSig(p) === this.lastSynced) return;
    try {
      const state: ConnectorState = { ...this.connectorState(), v: c.v, updatedAt: 0, notes: [] };
      const r = await putSession(c.code, c.v, state);
      if ('conflict' in r) {
        await this.applyRemote(r.conflict);
        this.set({ error: t('Nel frattempo la chat ha cambiato il modello: ho caricato la versione più recente.') });
        return;
      }
      this.lastSynced = this.syncSig(p);
      const now = this.snap.project;
      this.set({ project: { ...now, connector: { ...now.connector!, v: r.v } } });
      await saveProject(this.snap.project);
      await this.sendReport(true);
    } catch {
      this.schedulePush();
    }
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

  /** Somma il consumo al progetto; per le modalità senza API anche al riepilogo del mese. */
  private async addUsage(mode: 'api' | EstimatedMode, tally: TokenTally, usd = 0, extra?: Partial<Project>) {
    const p = this.snap.project;
    const usage = { ...p.usage };
    if (mode === 'api') usage.api = { ...addTally(usage.api, tally), usd: (usage.api?.usd ?? 0) + usd };
    else {
      usage[mode] = addTally(usage[mode], tally);
      new Budget(localStorage, store.get().settings.monthlyCapUsd).recordEstimate(mode, tally);
    }
    await this.persist({ ...p, ...extra, usage });
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
        return { parts: r.parts, errors: r.errors, connectors: r.connectors, overlaps: r.overlaps, buttons: r.buttons, printStats: r.printStats };
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
    if (store.get().settings.aiMode === 'manual') return this.prepareManual(text, force);
    const history = this.snap.project.chat.map((c) => ({ role: c.role, text: c.text })).filter((t) => t.text);
    await this.pushChat({ role: 'user', text });
    const client = makeClient();
    if (!client.isConfigured()) {
      this.set({ error: t('Per usare l’assistente scegli come collegarlo nelle impostazioni (⚙): chiave Gemini gratuita, copia e incolla con la tua chat, connettore per Claude o chiave a pagamento.') });
      return;
    }
    this.set({ busy: t('Capisco cosa ti serve…') });
    try {
      const s = store.get().settings;
      const decision = force
        ? { skill: force, hints: {} as { children?: boolean } }
        : await route(text, this.snap.project.design, { searchFirst: s.searchFirst, searched: this.searched(), smartRouting: s.smartRouting, client });
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
    await this.addUsage('api', { calls: 1, inputTokens: out.tokens.input, outputTokens: out.tokens.output }, out.costUsd);
    const tokens = out.tokens.input || out.tokens.output ? { input: out.tokens.input, output: out.tokens.output } : undefined;
    if (out.results) {
      if (query && out.results.length) await storeSearch(query, out.results);
      await this.pushChat({
        role: 'assistant',
        text: out.results.length ? out.text || t('Ecco cosa ho trovato. Scegline uno oppure chiedimi di crearlo da zero.') : t('Non ho trovato modelli con licenza adatta. Vuoi che lo crei da zero?'),
        results: out.results,
        skill,
        costUsd: out.costUsd,
        tokens,
      });
    } else if (out.text || !out.question) {
      await this.pushChat({ role: 'assistant', text: out.text || t('Fatto.'), skill, costUsd: out.costUsd, tokens });
    }
    if (out.question && out.state) {
      this.pendingAgent = { question: out.question, state: out.state };
      await this.refresh();
    }
  }

  /** La ricerca di modelli è già stata fatta in questo progetto? */
  private searched(): boolean {
    return this.snap.project.chat.some((c) => c.skill === 'cerca-modelli' || !!c.results?.length);
  }

  stop() {
    this.abort?.abort();
  }

  /* ---------- Copia e incolla con una chat qualsiasi ---------- */

  /** Prepara la richiesta da copiare (nessuna chiamata API). */
  async prepareManual(text: string, force?: SkillName, pushUser = true) {
    const s = store.get().settings;
    const design = this.snap.project.design;
    const decision = force ? { skill: force, hints: {} as { children?: boolean } } : routeByRules(text, design, { searchFirst: s.searchFirst, searched: this.searched() });
    if (decision.hints.children && !design.intendedUse.children) await this.applyLocal([{ op: 'set_meta', children: true }]);
    const history = this.snap.project.chat.map((c) => ({ role: c.role, text: c.text })).filter((x) => x.text);
    if (pushUser) await this.pushChat({ role: 'user', text });
    if (decision.skill === 'cerca-modelli') {
      const cached = await cachedSearch(text, LIMITS.searchCacheDays);
      if (cached) {
        await this.pushChat({ role: 'assistant', text: t('Ecco i modelli trovati (ricerca già fatta di recente, nessun costo):'), results: cached, skill: decision.skill, costUsd: 0 });
        return;
      }
    }
    const prompt = buildManualPrompt({
      skill: SKILLS[decision.skill],
      setup: this.setup,
      printer: this.printer,
      design: this.snap.project.design,
      report: this.snap.report ?? undefined,
      meshes: this.snap.meshInfo,
      reference: this.snap.project.reference,
      history,
      text,
    });
    this.set({ manual: { prompt, skill: decision.skill, text } });
  }

  cancelManual() {
    this.set({ manual: null, error: null });
  }

  /** Applica la risposta incollata dalla chat. */
  async applyManual(reply: string) {
    const m = this.snap.manual;
    if (!m) return;
    this.set({ error: null });
    // La chat ha già letto la richiesta e scritto la risposta: il consumo c'è anche se non si applica.
    const tokens = { input: estimateTokens(m.prompt), output: estimateTokens(reply), estimated: true };
    if (!m.counted && reply.trim()) {
      await this.addUsage('manual', { calls: 1, inputTokens: tokens.input, outputTokens: tokens.output });
      this.set({ manual: { ...m, counted: true } });
    }
    let parsed;
    try {
      parsed = parseManualReply(reply);
    } catch (e) {
      this.set({ error: (e as Error).message });
      return;
    }
    if (parsed.ops?.length && SKILLS[m.skill].tools.includes('edit_design')) {
      this.set({ busy: t('Modifico il modello…') });
      try {
        const out = await runTool('edit_design', { ops: parsed.ops, summary: parsed.summary }, this.env());
        if (out.kind === 'result' && out.isError) {
          this.set({ manual: { ...m, prompt: correctionPrompt(out.content), correction: true, counted: false }, error: t('La risposta non si può applicare: copia la richiesta di correzione e incolla di nuovo la risposta.') });
          return;
        }
      } finally {
        this.set({ busy: null });
      }
    }
    this.set({ manual: null });
    if (parsed.results) {
      if (parsed.results.length) await storeSearch(m.text, parsed.results);
      await this.pushChat({
        role: 'assistant',
        text: parsed.message || (parsed.results.length ? t('Ecco cosa ho trovato. Scegline uno oppure chiedimi di crearlo da zero.') : t('Non ho trovato modelli con licenza adatta. Vuoi che lo crei da zero?')),
        results: parsed.results,
        skill: m.skill,
        costUsd: 0,
        tokens,
      });
    } else if (parsed.message || !parsed.question) {
      await this.pushChat({ role: 'assistant', text: parsed.message || t('Fatto.'), skill: m.skill, costUsd: 0, tokens });
    }
    if (parsed.question) {
      const q = parsed.question;
      this.pendingManual = {
        skill: m.skill,
        text: m.text,
        question: { id: `manual:${Date.now()}`, key: `manual:${q.question}`, text: q.question, options: q.options, multi: q.multi, source: 'manual' },
      };
    }
    await this.refresh();
  }

  /** Risposta a una domanda (analisi locale = zero token, agente = riprende il ciclo). */
  async answer(q: Question, selected: string[]) {
    const chosen = q.options.filter((o) => selected.includes(o.id));
    if (q.source === 'manual' && this.pendingManual?.question.id === q.id) {
      const pending = this.pendingManual;
      this.pendingManual = null;
      const label = chosen.map((o) => o.label).join(', ') || t('nessuna preferenza');
      await this.pushChat({ role: 'user', text: label });
      await this.prepareManual(`${pending.text}\n\nAlla tua domanda «${q.text}» l'utente ha risposto: ${label}`, pending.skill, false);
      await this.refresh();
      return;
    }
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
      const mode = store.get().settings.aiMode;
      if (mode !== 'api') {
        const p0 = this.snap.project;
        await this.persist({ ...p0, answered: [...p0.answered, q.key] });
        if (ops.length) await this.applyLocal(ops);
        if (mode === 'manual') await this.prepareManual(ai.prompt!, 'modifica-modello');
        else await this.pushChat({ role: 'assistant', text: t('Chiedilo alla chat collegata: «{request}»', { request: ai.prompt! }) });
        return;
      }
      if (!makeClient().isConfigured()) {
        this.set({ error: t('Per usare l’assistente scegli come collegarlo nelle impostazioni (⚙): chiave Gemini gratuita, copia e incolla con la tua chat, connettore per Claude o chiave a pagamento.') });
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
    const separate = this.snap.project.design.printPlan.strategy === 'separate';
    return this.snap.parts.map((p) => {
      const f = fil.find((x) => x.id === p.filamentId);
      const h = this.snap.report?.printHints[p.id];
      const iface = h?.interfaceFilamentId ? fil.findIndex((x) => x.id === h.interfaceFilamentId) + 1 : 0;
      const print = h ? { supports: h.supports, brim: h.brim, interfaceExtruder: iface || undefined, ears: h.ears } : undefined;
      // Parti separate: ogni pezzo staccato della parte poggia sul piatto (vedi core/geometry/islands.ts).
      const mesh = separate && !groups.has(p.id) ? settleIslands(p.mesh) : p.mesh;
      return { name: p.name, mesh, filament: f, extruder: f ? fil.indexOf(f) + 1 : 1, group: groups.get(p.id), print };
    });
  }

  /** Genera e scarica i campioni di prova (un piatto per materiale). */
  async downloadCalibration(): Promise<CalibrationFiles | null> {
    this.set({ busy: t('Preparo i campioni di prova…'), error: null });
    try {
      const boxes = Object.fromEntries(this.snap.parts.map((p) => [p.id, { ...p.bbox, mesh: p.mesh }]));
      const files = await buildCalibrationFiles(this.snap.project.design, this.setup, this.printer, async (d, tol) => (await evaluateInWorker(d, this.meshes, tol)).parts, boxes);
      downloadBlob(new Blob([files.data as BlobPart], { type: files.mime }), files.filename);
      await this.pushChat({
        role: 'assistant',
        text:
          `${files.plates === 1 ? t('Ecco i campioni di prova: 1 piatto ({materials}).', { materials: files.materials.join(', ') }) : t('Ecco i campioni di prova: {n} piatti ({materials}).', { n: files.plates, materials: files.materials.join(', ') })} ` +
          t('Sono pezzi del tuo modello: dove ce ne sono 3, i segni (da 1 a 3) indicano il gioco. Dopo la stampa indica il migliore nella scheda Stampa → Campioni di prova.') +
          '\n\n' +
          files.series.map((s) => `${s.name}\n${s.pieces}\n${s.howto}`).join('\n\n'),
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
      keepFree: plateKeepFree(d, this.setup, this.printer),
      plateStride: this.printer.plateStride,
      slicerProfile: slicerProfileFor(this.setup, this.printer),
      filaments: this.setup.filaments,
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
