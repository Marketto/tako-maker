import type { Design, Question } from '../core/types';
import { applyOps, DesignError, type DesignOp } from '../core/design/ops';
import { printerBlock, compactDesign } from '../agent/context';
import { withoutUserChoices, type SearchResult } from '../agent/tools';
import { SKILLS } from '../agent/skills';
import systemMd from '../agent/prompts/system.md?raw';
import dslMd from '../agent/prompts/dsl.md?raw';
import { catalogText } from '../data/catalog';
import { addTally, estimateTokens } from '../agent/budget';
import { CODE_RE, MAX_NOTES, designKey, normalizeCode, update, type ConnectorReport, type ConnectorState, type ConnectorStore } from './state';

/* Server MCP di Printopus (trasporto "streamable HTTP", risposte JSON, senza stato
   tra una richiesta e l'altra): l'assistente della chat dell'utente (es. Claude)
   diventa l'assistente di Printopus, senza chiavi API a consumo.
   Gira in un Cloudflare Worker (connector/worker.ts) ed è testato in Node.
   La geometria e l'analisi le calcola l'app aperta (nel Worker gratuito la CPU non basta):
   il Worker valida e salva le operazioni, poi aspetta l'analisi che l'app rimanda. */

export type { ConnectorStore };

export interface ServerDeps {
  store: ConnectorStore;
  /** Indirizzo della PWA, per i link "apri in Printopus". */
  appUrl: string;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  /** Attesa massima dell'analisi dall'app dopo una modifica (ms). */
  reportWaitMs?: number;
}

export const SERVER_INFO = { name: 'printopus', version: '1.0.0' };
const PROTOCOL = '2025-06-18';

export const INSTRUCTIONS = [
  'Printopus aiuta a progettare oggetti da stampare in 3D sulla stampante dell’utente.',
  'Per iniziare chiedi all’utente il codice di abbinamento mostrato nell’app Printopus (formato XXXX-XXXX-XX), poi chiama printopus_apri: riceverai regole, stampante, filamenti e modello attuale.',
  'Modifica il modello solo con printopus_modifica. Rispondi all’utente nella sua lingua, con frasi brevi.',
].join(' ');

const codeProp = { codice: { type: 'string', description: 'Codice di abbinamento mostrato nell’app Printopus, es. K7QM-2XPA-9D' } };

export const TOOLS = [
  {
    name: 'printopus_apri',
    title: 'Apri il progetto Printopus',
    description: 'Collega la chat al progetto aperto nell’app Printopus. Restituisce le regole da seguire, stampante e filamenti dell’utente, il modello attuale (Design DSL) e l’analisi di stampa. Chiamalo all’inizio e quando l’utente dice di aver cambiato qualcosa nell’app.',
    inputSchema: { type: 'object', properties: codeProp, required: ['codice'] },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'printopus_modifica',
    title: 'Modifica il modello',
    description: 'Applica una lista di operazioni del Design DSL al modello (in modo atomico) e restituisce ingombri, analisi di stampa e domande aperte per l’utente. L’anteprima 3D si aggiorna nell’app Printopus.',
    inputSchema: {
      type: 'object',
      properties: {
        ...codeProp,
        ops: { type: 'array', items: { type: 'object', properties: { op: { type: 'string' } }, required: ['op'] }, description: 'Operazioni del Design DSL' },
        riassunto: { type: 'string', description: 'Descrizione brevissima della modifica' },
        messaggio: { type: 'string', description: 'Messaggio breve da mostrare anche nell’app' },
      },
      required: ['codice', 'ops'],
    },
  },
  {
    name: 'printopus_rispondi',
    title: 'Rispondi a una domanda dell’app',
    description: 'Registra la scelta dell’utente per una domanda automatica dell’app (strategia di stampa, colori, scatti, pulsanti, elementi da acquistare…) e applica le modifiche collegate. Fai prima la domanda all’utente in chat con le stesse opzioni.',
    inputSchema: {
      type: 'object',
      properties: {
        ...codeProp,
        domanda: { type: 'string', description: 'Id della domanda, come indicato tra parentesi quadre' },
        opzioni: { type: 'array', items: { type: 'string' }, description: 'Id delle opzioni scelte' },
      },
      required: ['codice', 'domanda', 'opzioni'],
    },
  },
  {
    name: 'printopus_mostra_risultati',
    title: 'Mostra modelli trovati',
    description: 'Mostra nell’app i modelli 3D gratuiti trovati con la tua ricerca web (massimo 6), come schede che l’utente può aprire o usare come ispirazione.',
    inputSchema: {
      type: 'object',
      properties: {
        ...codeProp,
        risultati: {
          type: 'array',
          maxItems: 6,
          items: {
            type: 'object',
            properties: { title: { type: 'string' }, url: { type: 'string' }, site: { type: 'string' }, author: { type: 'string' }, license: { type: 'string' }, summary: { type: 'string' }, printInPlace: { type: 'boolean' } },
            required: ['title', 'url', 'license', 'summary'],
          },
        },
        messaggio: { type: 'string' },
      },
      required: ['codice', 'risultati'],
    },
  },
];

type Json = Record<string, unknown>;
interface RpcRequest {
  jsonrpc: '2.0';
  id?: string | number | null;
  method: string;
  params?: Json;
}

const rpcResult = (id: RpcRequest['id'], result: unknown) => ({ jsonrpc: '2.0', id: id ?? null, result });
const rpcError = (id: RpcRequest['id'], code: number, message: string) => ({ jsonrpc: '2.0', id: id ?? null, error: { code, message } });
const text = (t: string, isError = false) => ({ content: [{ type: 'text', text: t }], ...(isError ? { isError: true } : {}) });

/** Gestisce un messaggio JSON-RPC (o un batch). Restituisce null per le sole notifiche. */
export async function handleRpc(body: unknown, deps: ServerDeps): Promise<unknown | null> {
  if (Array.isArray(body)) {
    const out = (await Promise.all(body.map((b) => handleOne(b as RpcRequest, deps)))).filter((x) => x !== null);
    return out.length ? out : null;
  }
  return handleOne(body as RpcRequest, deps);
}

async function handleOne(req: RpcRequest, deps: ServerDeps): Promise<unknown | null> {
  if (!req || req.jsonrpc !== '2.0' || typeof req.method !== 'string') return rpcError(null, -32600, 'Richiesta non valida');
  const isNotification = req.id === undefined;
  try {
    switch (req.method) {
      case 'initialize':
        return rpcResult(req.id, {
          protocolVersion: typeof req.params?.protocolVersion === 'string' ? req.params.protocolVersion : PROTOCOL,
          capabilities: { tools: { listChanged: false } },
          serverInfo: SERVER_INFO,
          instructions: INSTRUCTIONS,
        });
      case 'ping':
        return rpcResult(req.id, {});
      case 'tools/list':
        return rpcResult(req.id, { tools: TOOLS });
      case 'tools/call': {
        const name = String(req.params?.name ?? '');
        const args = (req.params?.arguments ?? {}) as Json;
        return rpcResult(req.id, await callTool(name, args, deps));
      }
      default:
        if (isNotification) return null;
        return rpcError(req.id, -32601, `Metodo non supportato: ${req.method}`);
    }
  } catch (e) {
    return isNotification ? null : rpcError(req.id, -32603, (e as Error).message);
  }
}

/* ---------- Strumenti ---------- */

const loadCode = (args: Json): string | { error: string } => {
  const code = normalizeCode(String(args.codice ?? ''));
  return CODE_RE.test(code) ? code : { error: 'Codice non valido: chiedi all’utente il codice di abbinamento mostrato nell’app Printopus (formato XXXX-XXXX-XX).' };
};
const MISSING = 'Nessun progetto con questo codice (forse è scaduto): nell’app Printopus premi di nuovo «Collega alla chat» e usa il nuovo codice.';

const nowOf = (deps: ServerDeps) => deps.now?.() ?? Date.now();
const sleepOf = (deps: ServerDeps) => deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));

/** Aspetta che l'app rimandi l'analisi del modello con impronta `key`. */
async function waitReport(deps: ServerDeps, code: string, key: string, maxMs: number): Promise<ConnectorReport | null> {
  const start = nowOf(deps);
  for (let i = 0; ; i++) {
    const cur = await deps.store.report(code, key);
    if (cur?.report) return cur.report;
    if (!cur?.current || nowOf(deps) - start >= maxMs || i > 100) return null;
    await sleepOf(deps)(800);
  }
}

function questionsText(qs: Question[]): string {
  if (!qs.length) return 'Nessuna domanda aperta.';
  return [
    'Domande aperte dell’app (falle all’utente in chat con queste opzioni, poi chiama printopus_rispondi):',
    ...qs.map((q) => `- [${q.key}] ${q.text}${q.detail ? ` (${q.detail})` : ''}${q.multi ? ' — scelta multipla' : ''}\n  opzioni: ${q.options.map((o) => `${o.id}) ${o.label}${o.hint ? ` — ${o.hint}` : ''}`).join('; ')}`),
  ].join('\n');
}

const appLink = (deps: ServerDeps, code: string) => `${deps.appUrl.replace(/\/$/, '')}/#/collega/${code}`;

/** Quando l'app non manda l'analisi: è chiusa, in un'altra scheda o il telefono è in standby. */
const noApp = (deps: ServerDeps, code: string) =>
  `L’analisi la calcola l’app Printopus, che ora non risponde (chiusa, in background o telefono in standby). Chiedi all’utente di aprirla e tenerla in primo piano (${appLink(deps, code)}), poi chiama printopus_apri per leggere analisi e domande.`;

function languageLine(state: ConnectorState): string {
  return state.language === 'it' ? 'L’utente usa l’app in italiano.' : `L’utente usa l’app in ${state.languageName}: scrivi in ${state.languageName} tutti i testi per l’utente, anche i nomi delle parti nuove.`;
}

type Note = ConnectorState['notes'][number];
type ToolText = ReturnType<typeof text>;

/** Token che la chat legge una volta per conversazione: istruzioni e definizioni degli strumenti. */
export const SETUP_TOKENS = estimateTokens(INSTRUCTIONS + JSON.stringify(TOOLS));

/** Nuovo stato con le modifiche della chat: la versione cresce, così l'app le scarica. */
function changed(deps: ServerDeps, s: ConnectorState, patch: Partial<ConnectorState>, note?: Omit<Note, 'at'>): ConnectorState {
  const now = nowOf(deps);
  return { ...s, ...patch, v: s.v + 1, updatedAt: now, notes: note ? [...s.notes, { ...note, at: now }].slice(-MAX_NOTES) : s.notes };
}

/** Somma la stima dei token della chiamata (non cambia versione). */
async function trackUsage(deps: ServerDeps, code: string, res: ToolText, args: Json, firstOpen: boolean) {
  await update(deps.store, code, (s) => ({
    out: null,
    next: {
      ...s,
      usage: addTally(s.usage, {
        calls: 1,
        inputTokens: estimateTokens(res.content.map((c) => c.text).join('\n')) + (firstOpen ? SETUP_TOKENS : 0),
        outputTokens: estimateTokens(JSON.stringify(args)),
      }),
    },
  })).catch(() => null);
}

async function callTool(name: string, args: Json, deps: ServerDeps) {
  const code = loadCode(args);
  if (typeof code !== 'string') return text(code.error, true);
  const out = await runConnectorTool(name, args, deps, code);
  if (out.missing) return text(MISSING, true);
  await trackUsage(deps, code, out.res, args, !!out.firstOpen);
  return out.res;
}

interface ToolOut {
  res: ToolText;
  missing?: boolean;
  firstOpen?: boolean;
}
const missing: ToolOut = { res: text(MISSING, true), missing: true };

/** Testo dopo una modifica salvata: analisi dall'app (se arriva) e domande. */
async function afterChange(deps: ServerDeps, code: string, saved: ConnectorState, head: string): Promise<ToolText> {
  const report = await waitReport(deps, code, designKey(saved), deps.reportWaitMs ?? 20000);
  if (!report) return text([head, `Modifica salvata (versione ${saved.v}): non ripeterla.`, noApp(deps, code)].join('\n'));
  if (report.errors.length)
    return text([head, `Modifica salvata (versione ${saved.v}), ma la geometria non è valida: ${report.errors.join(' | ')}`, 'Correggi con un’altra printopus_modifica.'].join('\n'));
  return text([head, `OK. ${report.text}`, '', questionsText(report.questions), '', `Anteprima aggiornata nell’app: ${appLink(deps, code)}`].join('\n'));
}

async function runConnectorTool(name: string, args: Json, deps: ServerDeps, code: string): Promise<ToolOut> {
  switch (name) {
    case 'printopus_apri': {
      // La prima apertura cambia versione: l'app se ne accorge e compatta il pannello del codice.
      const opened = await update(deps.store, code, (s) => ({ out: !s.openedAt, next: s.openedAt ? undefined : changed(deps, s, { openedAt: nowOf(deps) }) }));
      if (!opened) return missing;
      const state = opened.state;
      const skills = (['crea-modello', 'modifica-modello', 'consiglia-stampa', 'cerca-modelli'] as const)
        .map((s) => `### ${s}\n${SKILLS[s].description}\n${SKILLS[s].instructions}`)
        .join('\n\n');
      const parts = [
        `# Progetto Printopus ${code}`,
        `L’utente vede l’anteprima 3D nell’app: ${appLink(deps, code)}`,
        languageLine(state),
        '',
        systemMd,
        dslMd,
        '## Come usare gli strumenti',
        '- edit_design → printopus_modifica (stesse operazioni, in un’unica chiamata quando possibile).',
        '- ask_user → fai la domanda direttamente in chat, con poche opzioni.',
        '- web_search → la tua ricerca web; show_results → printopus_mostra_risultati.',
        '- print_report → l’analisi è qui sotto e arriva dopo ogni modifica (la calcola l’app aperta).',
        '- consulta_catalogo → il catalogo dei dettagli è qui sotto: rispetta quelle misure per meccanismi, supporti e piatto.',
        '- Le domande automatiche dell’app (strategia, colori, scatti, pulsanti, elementi da acquistare) sono elencate dopo ogni modifica: chiedile all’utente e registra la scelta con printopus_rispondi.',
        '- Le parti importate da file (mesh) non sono disponibili qui: chiedi all’utente di modificarle dall’app con la chiave API o il copia e incolla.',
        '- Se uno strumento dice che la modifica è salvata, non ripeterla: l’app la riceve da sola.',
        '',
        '## Compiti (come le skill dell’app)',
        skills,
        '',
        printerBlock(state.setup, state.printer),
        '',
        '## Catalogo dei dettagli provati in stampa',
        catalogText(),
      ];
      if (state.design.parts.length) {
        const report = await waitReport(deps, code, designKey(state), 6000);
        parts.push('', '## Modello attuale', compactDesign(state.design), '', '## Analisi di stampa');
        if (report) parts.push(report.errors.length ? `Geometria non valida: ${report.errors.join(' | ')}` : report.text, '', questionsText(report.questions));
        else parts.push(noApp(deps, code));
      } else {
        parts.push('', '## Modello attuale', 'Il modello è vuoto: chiedi all’utente cosa vuole stampare (o crealo se l’ha già detto).');
      }
      return { res: text(parts.join('\n')), firstOpen: opened.out };
    }

    case 'printopus_modifica': {
      if (!Array.isArray(args.ops) || !args.ops.length) return { res: text('Nessuna operazione ricevuta: passa le operazioni del Design DSL in "ops".', true) };
      const ops = (args.ops as DesignOp[]).map(withoutUserChoices);
      const msg = typeof args.messaggio === 'string' && args.messaggio.trim() ? args.messaggio.trim() : typeof args.riassunto === 'string' ? args.riassunto : '';
      const r = await update(deps.store, code, (s) => {
        let design: Design;
        try {
          design = applyOps(s.design, ops, new Set(s.setup.filaments.map((f) => f.id)));
        } catch (e) {
          return { out: e instanceof DesignError ? e.message : `Operazioni non valide: ${(e as Error).message}` };
        }
        return { out: '', next: changed(deps, s, { design }, msg ? { role: 'assistant', text: msg } : undefined) };
      });
      if (!r) return missing;
      if (r.out) return { res: text(r.out, true) };
      return { res: await afterChange(deps, code, r.state, '') };
    }

    case 'printopus_rispondi': {
      const key = String(args.domanda ?? '');
      const chosenIds = Array.isArray(args.opzioni) ? args.opzioni.map(String) : [];
      const cur = await deps.store.get(code);
      if (!cur) return missing;
      if (!cur.state.design.parts.length) return { res: text('Il modello è vuoto: non ci sono domande.', true) };
      const report = await waitReport(deps, code, designKey(cur.state), 8000);
      if (!report) return { res: text(`Le domande le prepara l’app. ${noApp(deps, code)}`, true) };
      const q = report.questions.find((x) => x.key === key || x.id === key);
      if (!q) return { res: text(`Domanda "${key}" non trovata (forse già risolta).\n\n${questionsText(report.questions)}`, true) };
      const chosen = q.options.filter((o) => chosenIds.includes(o.id));
      if (!chosen.length) return { res: text(`Opzione non valida. ${questionsText([q])}`, true) };
      const ops: DesignOp[] = [...(q.baseOps ?? []), ...chosen.flatMap((o) => o.ops ?? [])];
      const r = await update(deps.store, code, (s) => {
        if (designKey(s) !== report.key) return { out: 'Nel frattempo il modello è cambiato: chiama printopus_apri e rifai la domanda se è ancora aperta.' };
        let design = s.design;
        try {
          if (ops.length) design = applyOps(s.design, ops, new Set(s.setup.filaments.map((f) => f.id)));
        } catch (e) {
          return { out: `Non riesco ad applicare la scelta: ${(e as Error).message}` };
        }
        return { out: '', next: changed(deps, s, { design, answered: [...s.answered, q.key] }, { role: 'user', text: chosen.map((o) => o.label).join(', ') }) };
      });
      if (!r) return missing;
      if (r.out) return { res: text(r.out, true) };
      const extra: string[] = [`Scelta registrata: ${chosen.map((o) => o.label).join(', ')}.`];
      if (chosen.some((o) => o.action === 'calibration')) extra.push('L’utente deve scaricare i campioni di prova dall’app Printopus: scheda Stampa → «Scarica i campioni di prova».');
      const ai = chosen.find((o) => o.action === 'ask_ai' && o.prompt);
      if (ai) extra.push(`Ora fallo tu: ${ai.prompt}`);
      return { res: await afterChange(deps, code, r.state, extra.join('\n')) };
    }

    case 'printopus_mostra_risultati': {
      const list = (Array.isArray(args.risultati) ? args.risultati : []) as SearchResult[];
      const results = list
        .filter((r) => r && typeof r.url === 'string' && /^https?:\/\//.test(r.url) && typeof r.title === 'string')
        .slice(0, 6)
        .map((r) => ({ ...r, site: r.site || new URL(r.url).hostname, license: r.license || '?', summary: r.summary ?? '' }));
      if (!results.length) return { res: text('Nessun risultato valido (servono almeno titolo, url, licenza e descrizione).', true) };
      const msg = typeof args.messaggio === 'string' ? args.messaggio : '';
      const r = await update(deps.store, code, (s) => ({ out: null, next: changed(deps, s, {}, { role: 'assistant', text: msg, results }) }));
      if (!r) return missing;
      return { res: text(`Mostrati ${results.length} risultati nell’app: ${appLink(deps, code)}`) };
    }

    default:
      return { res: text(`Strumento sconosciuto: ${name}`, true) };
  }
}

/* ---------- API per la PWA (creazione e sincronizzazione della sessione) ---------- */

export function validState(s: unknown): s is ConnectorState {
  const x = s as ConnectorState;
  return !!x && typeof x === 'object' && !!x.design && Array.isArray(x.design.parts) && !!x.setup && !!x.printer && Array.isArray(x.answered);
}

type ApiOut = { status: number; body: unknown };

/** POST /sessione: nuova sessione con un codice libero. */
export async function apiCreate(deps: ServerDeps, body: unknown, newCode: () => string): Promise<ApiOut> {
  if (!validState(body)) return { status: 400, body: { error: 'Stato non valido' } };
  const state: ConnectorState = { ...body, v: 1, updatedAt: nowOf(deps), notes: [], openedAt: undefined, usage: undefined, report: undefined };
  for (let i = 0; i < 5; i++) {
    const code = newCode();
    if (await deps.store.put(code, state, null)) return { status: 201, body: { code, v: state.v } };
  }
  return { status: 503, body: { error: 'Nessun codice libero, riprova' } };
}

/** PUT /sessione/X: modifiche fatte nell'app, solo se partono dall'ultima versione. */
export async function apiPut(deps: ServerDeps, code: string, body: unknown): Promise<ApiOut> {
  const { baseV, state } = (body ?? {}) as { baseV: number; state: ConnectorState };
  if (!validState(state)) return { status: 400, body: { error: 'Stato non valido' } };
  const r = await update<ApiOut>(deps.store, code, (cur) => {
    if (baseV !== cur.v) return { out: { status: 409, body: { error: 'conflitto', state: cur } } };
    const next: ConnectorState = { ...cur, setup: state.setup, printer: state.printer, design: state.design, answered: state.answered, language: state.language, languageName: state.languageName, v: cur.v + 1, updatedAt: nowOf(deps) };
    return { out: { status: 200, body: { v: next.v } }, next };
  });
  return r ? r.out : { status: 404, body: { error: 'Sessione non trovata o scaduta' } };
}

/** POST /sessione/X/analisi: l'app rimanda l'analisi del modello che ha calcolato. */
export async function apiReport(deps: ServerDeps, code: string, body: unknown): Promise<ApiOut> {
  const b = (body ?? {}) as Partial<ConnectorReport>;
  if (typeof b.key !== 'string' || typeof b.text !== 'string' || !Array.isArray(b.questions) || !Array.isArray(b.errors) || b.text.length > 60000)
    return { status: 400, body: { error: 'Analisi non valida' } };
  const report: ConnectorReport = { key: b.key, text: b.text, questions: b.questions, errors: b.errors.map(String), at: nowOf(deps) };
  const r = await update<ApiOut>(deps.store, code, (cur) =>
    designKey(cur) === report.key ? { out: { status: 200, body: { ok: true } }, next: { ...cur, report } } : { out: { status: 409, body: { error: 'Modello cambiato' } } },
  );
  return r ? r.out : { status: 404, body: { error: 'Sessione non trovata o scaduta' } };
}
