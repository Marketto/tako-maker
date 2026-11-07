import type { ManifoldToplevel } from 'manifold-3d';
import type { Design, Question } from '../core/types';
import { evaluateDesign } from '../core/geometry/evaluate';
import { analyze, type AnalysisReport } from '../core/analysis';
import { applyOps, type DesignOp } from '../core/design/ops';
import { tolerancesByPart } from '../core/calibration/tolerances';
import { printerBlock, compactDesign } from '../agent/context';
import { reportText, runTool, type SearchResult, type ToolEnv } from '../agent/tools';
import { SKILLS } from '../agent/skills';
import systemMd from '../agent/prompts/system.md?raw';
import dslMd from '../agent/prompts/dsl.md?raw';
import { CODE_RE, MAX_NOTES, normalizeCode, type ConnectorState } from './state';

/* Server MCP di Printopus (trasporto "streamable HTTP", risposte JSON, senza stato
   tra una richiesta e l'altra): l'assistente della chat dell'utente (es. Claude)
   diventa l'assistente di Printopus, senza chiavi API a consumo.
   Gira in un Cloudflare Worker (connector/worker.ts) ed è testato in Node. */

export interface ConnectorStore {
  get(code: string): Promise<ConnectorState | null>;
  put(code: string, state: ConnectorState): Promise<void>;
}

export interface ServerDeps {
  store: ConnectorStore;
  manifold(): Promise<ManifoldToplevel>;
  /** Indirizzo della PWA, per i link "apri in Printopus". */
  appUrl: string;
  now?: () => number;
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

async function load(args: Json, deps: ServerDeps): Promise<{ code: string; state: ConnectorState } | { error: string }> {
  const code = normalizeCode(String(args.codice ?? ''));
  if (!CODE_RE.test(code)) return { error: 'Codice non valido: chiedi all’utente il codice di abbinamento mostrato nell’app Printopus (formato XXXX-XXXX-XX).' };
  const state = await deps.store.get(code);
  if (!state) return { error: 'Nessun progetto con questo codice (forse è scaduto): nell’app Printopus premi di nuovo «Collega alla chat» e usa il nuovo codice.' };
  return { code, state };
}

async function computeReport(state: ConnectorState, design: Design, deps: ServerDeps) {
  const w = await deps.manifold();
  const r = evaluateDesign(w, design, {}, tolerancesByPart(design, state.setup));
  const report = analyze(design, r.parts, state.setup, state.printer, new Set(state.answered), { connectors: r.connectors, overlaps: r.overlaps, buttons: r.buttons, printStats: r.printStats });
  return { r, report };
}

function env(state: ConnectorState, deps: ServerDeps, onCommit: (d: Design) => void): ToolEnv {
  return {
    design: () => state.design,
    commit: (d) => onCommit(d),
    setup: state.setup,
    printer: state.printer,
    evaluate: async (d) => {
      const w = await deps.manifold();
      const r = evaluateDesign(w, d, {}, tolerancesByPart(d, state.setup));
      return { parts: r.parts, errors: r.errors, connectors: r.connectors, overlaps: r.overlaps, buttons: r.buttons, printStats: r.printStats };
    },
    analyze: (d, parts, extras) => analyze(d, parts, state.setup, state.printer, new Set(state.answered), extras),
  };
}

function questionsText(qs: Question[]): string {
  if (!qs.length) return 'Nessuna domanda aperta.';
  return [
    'Domande aperte dell’app (falle all’utente in chat con queste opzioni, poi chiama printopus_rispondi):',
    ...qs.map((q) => `- [${q.key}] ${q.text}${q.detail ? ` (${q.detail})` : ''}${q.multi ? ' — scelta multipla' : ''}\n  opzioni: ${q.options.map((o) => `${o.id}) ${o.label}${o.hint ? ` — ${o.hint}` : ''}`).join('; ')}`),
  ].join('\n');
}

const appLink = (deps: ServerDeps, code: string) => `${deps.appUrl.replace(/\/$/, '')}/#/collega/${code}`;

function languageLine(state: ConnectorState): string {
  return state.language === 'it' ? 'L’utente usa l’app in italiano.' : `L’utente usa l’app in ${state.languageName}: scrivi in ${state.languageName} tutti i testi per l’utente, anche i nomi delle parti nuove.`;
}

async function save(deps: ServerDeps, code: string, state: ConnectorState, patch: Partial<ConnectorState>, note?: ConnectorState['notes'][number]) {
  const now = deps.now?.() ?? Date.now();
  const next: ConnectorState = { ...state, ...patch, v: state.v + 1, updatedAt: now, notes: note ? [...state.notes, { ...note, at: now }].slice(-MAX_NOTES) : state.notes };
  await deps.store.put(code, next);
  return next;
}

async function callTool(name: string, args: Json, deps: ServerDeps) {
  const loaded = await load(args, deps);
  if ('error' in loaded) return text(loaded.error, true);
  const { code, state } = loaded;

  switch (name) {
    case 'printopus_apri': {
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
        '- print_report → l’analisi è qui sotto e arriva dopo ogni modifica.',
        '- Le domande automatiche dell’app (strategia, colori, scatti, pulsanti, elementi da acquistare) sono elencate dopo ogni modifica: chiedile all’utente e registra la scelta con printopus_rispondi.',
        '- Le parti importate da file (mesh) non sono disponibili qui: chiedi all’utente di modificarle dall’app con la chiave API o il copia e incolla.',
        '',
        '## Compiti (come le skill dell’app)',
        skills,
        '',
        printerBlock(state.setup, state.printer),
      ];
      if (state.design.parts.length) {
        const { report } = await computeReport(state, state.design, deps);
        parts.push('', '## Modello attuale', compactDesign(state.design), '', '## Analisi di stampa', reportText(report), report.summary, '', questionsText(report.questions));
      } else {
        parts.push('', '## Modello attuale', 'Il modello è vuoto: chiedi all’utente cosa vuole stampare (o crealo se l’ha già detto).');
      }
      return text(parts.join('\n'));
    }

    case 'printopus_modifica': {
      if (!Array.isArray(args.ops) || !args.ops.length) return text('Nessuna operazione ricevuta: passa le operazioni del Design DSL in "ops".', true);
      const box: { design?: Design } = {};
      const out = await runTool('edit_design', { ops: args.ops, summary: args.riassunto }, env(state, deps, (d) => (box.design = d)));
      if (out.kind !== 'result' || out.isError || !box.design) return text(out.kind === 'result' ? out.content : 'Modifica non riuscita', true);
      const design = box.design;
      const msg = typeof args.messaggio === 'string' && args.messaggio.trim() ? args.messaggio.trim() : typeof args.riassunto === 'string' ? args.riassunto : '';
      await save(deps, code, state, { design }, msg ? { role: 'assistant', text: msg, at: 0 } : undefined);
      const { report } = await computeReport({ ...state, design }, design, deps);
      return text([out.content, '', questionsText(report.questions), '', `Anteprima aggiornata nell’app: ${appLink(deps, code)}`].join('\n'));
    }

    case 'printopus_rispondi': {
      const key = String(args.domanda ?? '');
      const chosenIds = Array.isArray(args.opzioni) ? args.opzioni.map(String) : [];
      if (!state.design.parts.length) return text('Il modello è vuoto: non ci sono domande.', true);
      const { report } = await computeReport(state, state.design, deps);
      const q = report.questions.find((x) => x.key === key || x.id === key);
      if (!q) return text(`Domanda "${key}" non trovata (forse già risolta).\n\n${questionsText(report.questions)}`, true);
      const chosen = q.options.filter((o) => chosenIds.includes(o.id));
      if (!chosen.length) return text(`Opzione non valida. ${questionsText([q])}`, true);
      const ops: DesignOp[] = [...(q.baseOps ?? []), ...chosen.flatMap((o) => o.ops ?? [])];
      let design = state.design;
      if (ops.length) {
        try {
          design = applyOps(state.design, ops, new Set(state.setup.filaments.map((f) => f.id)));
        } catch (e) {
          return text(`Non riesco ad applicare la scelta: ${(e as Error).message}`, true);
        }
      }
      const answered = [...state.answered, q.key];
      await save(deps, code, state, { design, answered }, { role: 'user', text: chosen.map((o) => o.label).join(', '), at: 0 });
      const extra: string[] = [];
      if (chosen.some((o) => o.action === 'calibration')) extra.push('L’utente deve scaricare i campioni di prova dall’app Printopus: scheda Stampa → «Scarica i campioni di prova».');
      const ai = chosen.find((o) => o.action === 'ask_ai' && o.prompt);
      if (ai) extra.push(`Ora fallo tu: ${ai.prompt}`);
      const after = await computeReport({ ...state, design, answered }, design, deps);
      return text([`Scelta registrata: ${chosen.map((o) => o.label).join(', ')}.`, ...extra, '', reportText(after.report), '', questionsText(after.report.questions)].join('\n'));
    }

    case 'printopus_mostra_risultati': {
      const list = (Array.isArray(args.risultati) ? args.risultati : []) as SearchResult[];
      const results = list
        .filter((r) => r && typeof r.url === 'string' && /^https?:\/\//.test(r.url) && typeof r.title === 'string')
        .slice(0, 6)
        .map((r) => ({ ...r, site: r.site || new URL(r.url).hostname, license: r.license || '?', summary: r.summary ?? '' }));
      if (!results.length) return text('Nessun risultato valido (servono almeno titolo, url, licenza e descrizione).', true);
      const msg = typeof args.messaggio === 'string' ? args.messaggio : '';
      await save(deps, code, state, {}, { role: 'assistant', text: msg, results, at: 0 });
      return text(`Mostrati ${results.length} risultati nell’app: ${appLink(deps, code)}`);
    }

    default:
      return text(`Strumento sconosciuto: ${name}`, true);
  }
}

/* ---------- API per la PWA (creazione e sincronizzazione della sessione) ---------- */

export function validState(s: unknown): s is ConnectorState {
  const x = s as ConnectorState;
  return !!x && typeof x === 'object' && !!x.design && Array.isArray(x.design.parts) && !!x.setup && !!x.printer && Array.isArray(x.answered);
}

export type { AnalysisReport };
