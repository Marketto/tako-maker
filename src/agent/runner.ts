import type { Question } from '../core/types';
import type { ApiResponse, ClaudeClient, ContentBlock, Message } from './client';
import { withCache } from './client';
import { LIMITS, type ModelTier } from './config';
import type { Skill } from './skills';
import { runTool, toolsFor, type SearchResult, type ToolEnv } from './tools';
import { systemBlocks, userContext, type ImportedMeshInfo } from './context';
import type { AnalysisReport } from '../core/analysis';

/* Ciclo agente: chiama Claude, esegue gli strumenti richiesti, ripete
   finché il modello non ha finito (o si raggiunge il limite di iterazioni).
   - ask_user mette in pausa il ciclo: l'app mostra la domanda e poi riprende;
   - show_results termina subito (non serve un'altra chiamata: si risparmiano token). */

export interface ChatTurn {
  role: 'user' | 'assistant';
  text: string;
}

export interface AgentEvent {
  type: 'thinking' | 'tool' | 'design';
  label: string;
}

export interface AgentState {
  skill: Skill;
  tier: ModelTier;
  messages: Message[];
  pendingToolUseId: string;
  partialResults: ContentBlock[];
  costUsd: number;
}

export interface AgentOutcome {
  text: string;
  results?: SearchResult[];
  question?: Question;
  /** Presente se il ciclo è in pausa in attesa di una risposta. */
  state?: AgentState;
  costUsd: number;
}

export interface RunInput {
  skill: Skill;
  text: string;
  history: ChatTurn[];
  env: ToolEnv;
  client: ClaudeClient;
  economy: boolean;
  meshes: ImportedMeshInfo[];
  report?: AnalysisReport;
  reference?: SearchResult;
  signal?: AbortSignal;
  onEvent?: (e: AgentEvent) => void;
}

const TOOL_LABEL: Record<string, string> = {
  web_search: 'Cerco modelli online…',
  edit_design: 'Modifico il modello…',
  print_report: 'Calcolo tempi e consumi…',
  ask_user: 'Ho una domanda…',
  show_results: 'Preparo i risultati…',
};

export async function runAgent(input: RunInput): Promise<AgentOutcome> {
  const tier: ModelTier = input.economy ? 'fast' : input.skill.tier;
  const history: Message[] = input.history.slice(-LIMITS.historyMessages).map((t) => ({ role: t.role, content: t.text }));
  // La cronologia deve iniziare con un messaggio utente.
  while (history.length && history[0].role !== 'user') history.shift();
  const ctx = userContext({ design: input.env.design(), report: input.report, meshes: input.meshes, reference: input.reference });
  const messages: Message[] = [...history, { role: 'user', content: `${ctx}\n\n${input.text}` }];
  return loop(input, { skill: input.skill, tier, messages, pendingToolUseId: '', partialResults: [], costUsd: 0 });
}

export async function resumeAgent(input: Omit<RunInput, 'text' | 'history'>, state: AgentState, answer: string): Promise<AgentOutcome> {
  const results: ContentBlock[] = [...state.partialResults, { type: 'tool_result', tool_use_id: state.pendingToolUseId, content: `Risposta dell'utente: ${answer}` }];
  const messages: Message[] = [...state.messages, { role: 'user', content: results }];
  return loop({ ...input, text: '', history: [] }, { ...state, messages, pendingToolUseId: '', partialResults: [] });
}

function textOf(res: ApiResponse): string {
  return res.content
    .filter((b): b is Extract<ContentBlock, { type: 'text' }> => b.type === 'text')
    .map((b) => b.text)
    .join('\n')
    .trim();
}

async function loop(input: RunInput, state: AgentState): Promise<AgentOutcome> {
  const { skill, tier } = state;
  const system = systemBlocks(skill, input.env.setup, input.env.printer);
  const tools = withCache(toolsFor(skill.tools));
  let cost = state.costUsd;
  const messages = state.messages;
  const texts: string[] = [];

  for (let turn = 0; turn < LIMITS.maxAgentTurns; turn++) {
    input.onEvent?.({ type: 'thinking', label: turn === 0 ? 'Ci penso…' : 'Continuo…' });
    const res = await input.client.send(
      { tier, system, messages, tools: tools.length ? tools : undefined, max_tokens: skill.maxTokens },
      input.signal,
    );
    cost += res.costUsd;
    messages.push({ role: 'assistant', content: res.content });
    const t = textOf(res);
    if (t) texts.push(t);

    if (res.stop_reason === 'pause_turn') continue; // ricerca web lunga: il server chiede di proseguire
    const uses = res.content.filter((b): b is Extract<ContentBlock, { type: 'tool_use' }> => b.type === 'tool_use');
    if (!uses.length || res.stop_reason !== 'tool_use') {
      if (res.stop_reason === 'max_tokens') texts.push('(Risposta interrotta: richiesta troppo lunga. Prova a dividerla in passi più piccoli.)');
      return { text: texts.join('\n\n'), costUsd: cost };
    }

    const results: ContentBlock[] = [];
    for (const u of uses) {
      input.onEvent?.({ type: 'tool', label: TOOL_LABEL[u.name] ?? u.name });
      const out = await runTool(u.name, u.input, input.env);
      if (out.kind === 'question') {
        return { text: texts.join('\n\n'), question: out.question, costUsd: cost, state: { ...state, messages, pendingToolUseId: u.id, partialResults: results, costUsd: cost } };
      }
      if (out.kind === 'results') {
        return { text: texts.join('\n\n'), results: out.results, costUsd: cost };
      }
      if (u.name === 'edit_design' && !out.isError) input.onEvent?.({ type: 'design', label: 'Anteprima aggiornata' });
      results.push({ type: 'tool_result', tool_use_id: u.id, content: out.content, is_error: out.isError });
    }
    messages.push({ role: 'user', content: results });
  }
  texts.push('(Mi sono fermato per non consumare troppo credito. Dimmi se vuoi che continui.)');
  return { text: texts.join('\n\n'), costUsd: cost };
}
