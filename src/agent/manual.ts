import type { DesignOp } from '../core/design/ops';
import type { PrinterSpec, UserSetup, Design } from '../core/types';
import type { AnalysisReport } from '../core/analysis';
import type { Skill } from './skills';
import type { ChatTurn } from './runner';
import type { SearchResult } from './tools';
import { reportText } from './tools';
import { systemBlocks, userContext, type ImportedMeshInfo } from './context';
import { t } from '../i18n';

/* Modalità "copia e incolla": nessuna chiamata API. L'app prepara una richiesta
   completa da incollare in una chat qualsiasi (ChatGPT, Claude, Gemini…) e legge
   la risposta, che deve contenere un solo blocco JSON. Le modifiche passano dalla
   stessa validazione del ciclo agente (strumento edit_design). */

export interface ManualInput {
  skill: Skill;
  setup: UserSetup;
  printer: PrinterSpec;
  design: Design;
  report?: AnalysisReport;
  meshes: ImportedMeshInfo[];
  reference?: SearchResult;
  history: ChatTurn[];
  text: string;
}

export interface ManualReply {
  message?: string;
  ops?: DesignOp[];
  summary?: string;
  question?: { question: string; options: { id: string; label: string }[]; multi?: boolean };
  results?: SearchResult[];
}

/** Quali campi della risposta corrispondono agli strumenti della skill. */
function formatSection(skill: Skill): string {
  const tools = new Set(skill.tools);
  const fields: string[] = ['  "message": "testo per l’utente (breve)"'];
  const map: string[] = [];
  if (tools.has('edit_design')) {
    fields.push('  "ops": [ { "op": "...", ... } ],', '  "summary": "descrizione brevissima della modifica"');
    map.push('- edit_design → campi "ops" (le operazioni) e "summary". Mandale tutte insieme: l’app le applica in modo atomico e, se qualcosa non va, ti rimanderà l’errore.');
  }
  if (tools.has('ask_user')) {
    fields.push('  "question": { "question": "…", "options": [ { "id": "a", "label": "…" } ], "multi": false }');
    map.push('- ask_user → campo "question" (se fai una domanda, non mandare "ops": aspetta la risposta).');
  }
  if (tools.has('show_results')) {
    fields.push('  "results": [ { "title": "…", "url": "…", "site": "…", "author": "…", "license": "…", "summary": "…", "printInPlace": false } ]');
    map.push('- show_results → campo "results" (massimo 6).');
  }
  if (tools.has('web_search')) map.push('- web_search → usa la tua ricerca web, se ce l’hai; altrimenti dillo in "message" e proponi link utili.');
  if (tools.has('print_report')) map.push('- print_report → non serve: l’analisi attuale è qui sotto.');
  return [
    '## Come rispondere',
    'Non hai strumenti da chiamare: dove le istruzioni nominano uno strumento usa il campo corrispondente della risposta.',
    ...map,
    'Rispondi con UN SOLO blocco di codice JSON (```json … ```) e nient’altro, con questi campi (tutti facoltativi):',
    '```json',
    '{',
    fields.join(',\n'),
    '}',
    '```',
  ].join('\n');
}

/** Testo completo da copiare nella chat. */
export function buildManualPrompt(input: ManualInput): string {
  const sys = systemBlocks(input.skill, input.setup, input.printer)
    .map((b) => b.text)
    .join('\n\n');
  const ctx = userContext({ design: input.design, report: input.report, meshes: input.meshes, reference: input.reference });
  const history = input.history
    .slice(-6)
    .filter((h) => h.text)
    .map((h) => `${h.role === 'user' ? 'Utente' : 'Assistente'}: ${h.text}`)
    .join('\n');
  return [
    '# Printopus – richiesta per l’assistente',
    'Questa richiesta arriva da Printopus, un’app per progettare oggetti da stampare in 3D. L’utente incollerà la tua risposta nell’app, che la applica da sola.',
    '',
    sys,
    '',
    input.report && input.design.parts.length ? `## Analisi di stampa attuale\n${reportText(input.report)}` : '',
    ctx,
    history ? `## Conversazione recente\n${history}` : '',
    `## Richiesta dell’utente\n${input.text}`,
    '',
    formatSection(input.skill),
  ]
    .filter((s) => s !== '')
    .join('\n');
}

/** Richiesta di correzione dopo una risposta non valida. */
export function correctionPrompt(error: string): string {
  return [
    '# Printopus – correzione',
    'L’app non ha potuto applicare la tua ultima risposta per questo motivo:',
    error,
    '',
    'Correggi e rimanda la risposta completa, sempre come UN SOLO blocco di codice JSON (```json … ```) con gli stessi campi.',
  ].join('\n');
}

export class ManualReplyError extends Error {}

/** Estrae il JSON dalla risposta incollata (anche con testo intorno o virgole di troppo). */
export function parseManualReply(text: string): ManualReply {
  const src = text.trim();
  const candidates: string[] = [];
  for (const m of src.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi)) candidates.push(m[1]);
  const first = src.indexOf('{');
  const last = src.lastIndexOf('}');
  if (first >= 0 && last > first) candidates.push(src.slice(first, last + 1));
  for (const c of candidates) {
    for (const attempt of [c, c.replace(/,\s*([}\]])/g, '$1')]) {
      try {
        const v = JSON.parse(attempt) as unknown;
        if (v && typeof v === 'object' && !Array.isArray(v)) return normalize(v as Record<string, unknown>);
      } catch {
        /* prova il prossimo */
      }
    }
  }
  throw new ManualReplyError(t('Non trovo il blocco JSON nella risposta: copia tutta la risposta della chat e riprova.'));
}

function normalize(v: Record<string, unknown>): ManualReply {
  const out: ManualReply = {};
  if (typeof v.message === 'string' && v.message.trim()) out.message = v.message.trim();
  if (typeof v.summary === 'string') out.summary = v.summary;
  if (Array.isArray(v.ops)) {
    if (!v.ops.every((o) => o && typeof o === 'object' && typeof (o as { op?: unknown }).op === 'string')) {
      throw new ManualReplyError(t('Nella risposta ci sono operazioni senza il campo "op".'));
    }
    if (v.ops.length) out.ops = v.ops as DesignOp[];
  }
  const q = v.question as ManualReply['question'] | undefined;
  if (q && typeof q === 'object' && typeof q.question === 'string' && Array.isArray(q.options) && q.options.length >= 2) {
    out.question = {
      question: q.question,
      options: q.options.slice(0, 5).map((o, i) => ({ id: String(o?.id ?? i), label: String(o?.label ?? o?.id ?? i) })),
      multi: !!q.multi,
    };
  }
  if (Array.isArray(v.results)) {
    out.results = (v.results as SearchResult[])
      .filter((r) => r && typeof r.title === 'string' && typeof r.url === 'string' && /^https?:\/\//.test(r.url))
      .slice(0, 6)
      .map((r) => ({ ...r, site: r.site ?? new URL(r.url).hostname, license: r.license || '?', summary: r.summary ?? '' }));
  }
  if (!out.message && !out.ops && !out.question && !out.results?.length) {
    throw new ManualReplyError(t('La risposta non contiene né modifiche né un messaggio.'));
  }
  return out;
}

/** Link per aprire le chat più usate in una nuova scheda. */
export const CHAT_LINKS = [
  { name: 'ChatGPT', url: 'https://chatgpt.com/' },
  { name: 'Claude', url: 'https://claude.ai/new' },
  { name: 'Gemini', url: 'https://gemini.google.com/app' },
];
