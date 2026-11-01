import type { Design, PrinterSpec, Question, UserSetup } from '../core/types';
import { applyOps, DesignError, type DesignOp } from '../core/design/ops';
import type { AnalysisReport } from '../core/analysis';
import type { ConnectorReport, OverlapReport } from '../core/geometry/evaluate';
import type { PartStat } from '../core/analysis/estimate';
import { fmtTime, STRATEGY_LABEL } from '../core/analysis/estimate';
import type { ServerTool, ToolDef } from './client';
import { LIMITS, SEARCH_DOMAINS } from './config';

/* Strumenti esposti all'AI. Tutti tranne web_search girano nel browser:
   costano zero e restituiscono risposte compatte per risparmiare token. */

export interface SearchResult {
  title: string;
  url: string;
  site: string;
  author?: string;
  license: string;
  summary: string;
  printInPlace?: boolean;
}

export interface ToolEnv {
  design(): Design;
  commit(d: Design, summary?: string): void;
  setup: UserSetup;
  printer: PrinterSpec;
  /** Calcola la geometria (Web Worker) e restituisce statistiche per parte. */
  evaluate(d: Design): Promise<{ parts: PartStat[]; errors: string[]; connectors?: ConnectorReport[]; overlaps?: OverlapReport[] }>;
  analyze(d: Design, parts: PartStat[], extras?: { connectors?: ConnectorReport[]; overlaps?: OverlapReport[] }): AnalysisReport;
}

export const TOOL_DEFS: Record<string, ToolDef | ServerTool> = {
  web_search: {
    type: 'web_search_20250305',
    name: 'web_search',
    max_uses: LIMITS.maxSearchUses,
    allowed_domains: SEARCH_DOMAINS,
  },
  show_results: {
    name: 'show_results',
    description: 'Mostra all’utente i modelli trovati, come schede selezionabili. Chiamalo una sola volta alla fine della ricerca.',
    input_schema: {
      type: 'object',
      properties: {
        results: {
          type: 'array',
          maxItems: 6,
          items: {
            type: 'object',
            properties: {
              title: { type: 'string' },
              url: { type: 'string' },
              site: { type: 'string' },
              author: { type: 'string' },
              license: { type: 'string', description: 'Es. "CC BY 4.0", oppure "da verificare"' },
              summary: { type: 'string', description: 'Una frase in italiano' },
              printInPlace: { type: 'boolean' },
            },
            required: ['title', 'url', 'site', 'license', 'summary'],
          },
        },
      },
      required: ['results'],
    },
  },
  edit_design: {
    name: 'edit_design',
    description:
      'Modifica il modello con una lista di operazioni del Design DSL. Le modifiche sono atomiche: se una operazione non è valida nessuna viene applicata e ricevi l’errore. In caso di successo ricevi ingombri delle parti e analisi di stampa.',
    input_schema: {
      type: 'object',
      properties: {
        ops: { type: 'array', items: { type: 'object' }, description: 'Operazioni: set_meta, add_part, update_part, move_part, remove_part, add_joint, update_joint, remove_joint, set_plan' },
        summary: { type: 'string', description: 'Descrizione brevissima della modifica, per la cronologia (es. "schermo più grande")' },
      },
      required: ['ops'],
    },
  },
  ask_user: {
    name: 'ask_user',
    description: 'Fai UNA domanda all’utente con poche opzioni brevi. Usalo solo se la scelta cambia molto il risultato.',
    input_schema: {
      type: 'object',
      properties: {
        question: { type: 'string' },
        options: { type: 'array', minItems: 2, maxItems: 5, items: { type: 'object', properties: { id: { type: 'string' }, label: { type: 'string' } }, required: ['id', 'label'] } },
        multi: { type: 'boolean' },
      },
      required: ['question', 'options'],
    },
  },
  print_report: {
    name: 'print_report',
    description: 'Stime locali per ogni strategia di stampa (tempo, grammi, scarto, fattibilità) e avvisi.',
    input_schema: { type: 'object', properties: {} },
  },
};

export function toolsFor(names: string[]): (ToolDef | ServerTool)[] {
  return names.map((n) => TOOL_DEFS[n]).filter(Boolean);
}

/** Riassunto compatto dell'analisi da rimandare all'AI. */
export function reportText(r: AnalysisReport): string {
  const lines = r.estimates.map(
    (e) => `- ${STRATEGY_LABEL[e.strategy]}: ${e.feasible ? `${fmtTime(e.timeS)}, ${e.filamentG.toFixed(0)} g, scarto ${e.wasteG.toFixed(0)} g, piatti ${e.plates}` : `non possibile (${e.reason})`}`,
  );
  if (r.warnings.length) lines.push(...r.warnings.map((w) => `! ${w}`));
  return lines.join('\n');
}

function partsText(d: Design, parts: PartStat[], setup: UserSetup): string {
  const fil = new Map(setup.filaments.map((f) => [f.id, `${f.material} ${f.colorName}`]));
  return parts
    .map((p) => {
      const name = d.parts.find((x) => x.id === p.id)?.name ?? p.id;
      const size = [0, 1, 2].map((k) => (p.bbox.max[k] - p.bbox.min[k]).toFixed(0)).join('×');
      return `${p.id} "${name}" ${size} mm, ${fil.get(p.filamentId ?? '') ?? 'senza filamento'}`;
    })
    .join('; ');
}

export type ToolOutcome =
  | { kind: 'result'; content: string; isError?: boolean }
  | { kind: 'question'; question: Question }
  | { kind: 'results'; results: SearchResult[] };

export async function runTool(name: string, input: unknown, env: ToolEnv): Promise<ToolOutcome> {
  const args = (input ?? {}) as Record<string, unknown>;
  switch (name) {
    case 'edit_design': {
      const ops = args.ops as DesignOp[];
      if (!Array.isArray(ops) || !ops.length) return { kind: 'result', content: 'Nessuna operazione ricevuta.', isError: true };
      let next: Design;
      try {
        next = applyOps(env.design(), ops, new Set(env.setup.filaments.map((f) => f.id)));
      } catch (e) {
        const msg = e instanceof DesignError ? e.message : `Operazioni non valide: ${(e as Error).message}`;
        return { kind: 'result', content: msg, isError: true };
      }
      const ev = await env.evaluate(next);
      if (ev.errors.length) return { kind: 'result', content: `Geometria non valida: ${ev.errors.join(' | ')}`, isError: true };
      env.commit(next, typeof args.summary === 'string' ? args.summary : undefined);
      const report = env.analyze(next, ev.parts, ev);
      return { kind: 'result', content: `OK. Parti: ${partsText(next, ev.parts, env.setup)}\nAnalisi:\n${reportText(report)}` };
    }
    case 'print_report': {
      const d = env.design();
      const ev = await env.evaluate(d);
      return { kind: 'result', content: reportText(env.analyze(d, ev.parts, ev)) };
    }
    case 'ask_user': {
      const opts = Array.isArray(args.options) ? (args.options as { id: string; label: string }[]) : [];
      const text = String(args.question ?? '');
      return {
        kind: 'question',
        question: { id: `agent:${Date.now()}`, key: `agent:${text}`, text, options: opts.slice(0, 5).map((o) => ({ id: String(o.id), label: String(o.label) })), multi: !!args.multi, source: 'agent' },
      };
    }
    case 'show_results': {
      const list = Array.isArray(args.results) ? (args.results as SearchResult[]) : [];
      return { kind: 'results', results: list.filter((r) => r && /^https:\/\//.test(r.url)).slice(0, 6) };
    }
    default:
      return { kind: 'result', content: `Strumento sconosciuto: ${name}`, isError: true };
  }
}
