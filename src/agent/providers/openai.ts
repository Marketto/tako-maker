import type { ApiResponse, ContentBlock, ServerTool, ToolDef } from '../client';
import { errorMessage, type Adapter } from './types';

/* OpenAI tramite la Responses API (funzioni + ricerca web nella stessa richiesta).
   - system → instructions
   - tool_use → item "function_call", tool_result → item "function_call_output"
   - web_search (tool lato server di Claude) → { type: "web_search" }
   La cache dei prompt di OpenAI è automatica sui prefissi uguali. */

type InputItem =
  | { role: 'user' | 'assistant'; content: string }
  | { type: 'function_call'; call_id: string; name: string; arguments: string }
  | { type: 'function_call_output'; call_id: string; output: string };

function toInput(messages: Parameters<Adapter['build']>[0]['messages']): InputItem[] {
  const out: InputItem[] = [];
  for (const m of messages) {
    if (typeof m.content === 'string') {
      out.push({ role: m.role, content: m.content });
      continue;
    }
    for (const b of m.content) {
      if (b.type === 'text' && b.text) out.push({ role: m.role, content: b.text });
      else if (b.type === 'tool_use') out.push({ type: 'function_call', call_id: b.id, name: b.name, arguments: JSON.stringify(b.input ?? {}) });
      else if (b.type === 'tool_result') out.push({ type: 'function_call_output', call_id: b.tool_use_id, output: b.is_error ? `ERRORE: ${b.content}` : b.content });
    }
  }
  return out;
}

function toTools(tools: (ToolDef | ServerTool)[] = []) {
  return tools.map((t) =>
    'input_schema' in t
      ? { type: 'function', name: t.name, description: t.description, parameters: t.input_schema, strict: false }
      : { type: 'web_search' },
  );
}

interface OutItem {
  type: string;
  content?: { type: string; text?: string }[];
  call_id?: string;
  name?: string;
  arguments?: string;
}

export const openaiAdapter: Adapter = {
  id: 'openai',
  build(req, model, key) {
    const body: Record<string, unknown> = {
      model,
      instructions: req.system.map((s) => s.text).join('\n\n'),
      input: toInput(req.messages),
      // I modelli con ragionamento usano parte dei token in uscita per "pensare".
      max_output_tokens: Math.max(req.max_tokens * 2, 1024),
      store: false,
    };
    if (req.tools?.length) body.tools = toTools(req.tools);
    return {
      url: 'https://api.openai.com/v1/responses',
      init: { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${key.key}` }, body: JSON.stringify(body) },
    };
  },
  parse(json) {
    const r = json as { id: string; status?: string; incomplete_details?: { reason?: string }; output?: OutItem[]; usage?: { input_tokens: number; output_tokens: number; input_tokens_details?: { cached_tokens?: number } } };
    const content: ContentBlock[] = [];
    let searches = 0;
    for (const item of r.output ?? []) {
      if (item.type === 'message') for (const c of item.content ?? []) if (c.type === 'output_text' && c.text) content.push({ type: 'text', text: c.text });
      if (item.type === 'function_call') {
        let input: unknown = {};
        try {
          input = JSON.parse(item.arguments || '{}');
        } catch {
          input = {};
        }
        content.push({ type: 'tool_use', id: item.call_id ?? `call_${content.length}`, name: item.name ?? '', input });
      }
      if (item.type === 'web_search_call') searches++;
    }
    const cached = r.usage?.input_tokens_details?.cached_tokens ?? 0;
    const stop: ApiResponse['stop_reason'] = content.some((b) => b.type === 'tool_use')
      ? 'tool_use'
      : r.status === 'incomplete' && r.incomplete_details?.reason === 'max_output_tokens'
        ? 'max_tokens'
        : 'end_turn';
    return {
      id: r.id,
      content,
      stop_reason: stop,
      usage: {
        input_tokens: Math.max(0, (r.usage?.input_tokens ?? 0) - cached),
        output_tokens: r.usage?.output_tokens ?? 0,
        cache_read_input_tokens: cached,
        server_tool_use: { web_search_requests: searches },
      },
    };
  },
  classify(status, body) {
    const err = (body as { error?: { code?: string; type?: string } } | null)?.error;
    const msg = errorMessage(body);
    if (err?.code === 'insufficient_quota' || /quota|billing/i.test(msg)) return { kind: 'exhausted', message: 'credito esaurito' };
    if (status === 401 || status === 403) return { kind: 'invalid', message: 'chiave non valida' };
    if (status === 429) return { kind: 'rate', message: 'troppe richieste' };
    if (status >= 500) return { kind: 'temporary', message: 'servizio non disponibile' };
    return { kind: 'fatal', message: msg || `errore ${status}` };
  },
};
