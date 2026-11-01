import type { ApiResponse, ContentBlock, ServerTool, ToolDef } from '../client';
import { errorMessage, type Adapter } from './types';

/* Gemini tramite generateContent.
   - system → systemInstruction; ruolo assistant → "model"
   - tool_use → part functionCall (con la thoughtSignature da rimandare tale e quale)
   - tool_result → part functionResponse (serve il nome della funzione)
   - web_search → { googleSearch: {} }
   La cache dei prompt di Gemini è implicita sui prefissi uguali. */

const SCHEMA_KEYS = new Set(['type', 'description', 'properties', 'required', 'items', 'enum', 'minItems', 'maxItems', 'minimum', 'maximum', 'nullable', 'format']);

/** Riduce lo schema JSON al sottoinsieme accettato da Gemini. */
export function sanitizeSchema(s: unknown): unknown {
  if (Array.isArray(s)) return s.map(sanitizeSchema);
  if (!s || typeof s !== 'object') return s;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(s as Record<string, unknown>)) {
    if (!SCHEMA_KEYS.has(k)) continue;
    if (k === 'properties') {
      out[k] = Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([pk, pv]) => [pk, sanitizeSchema(pv)]));
    } else out[k] = sanitizeSchema(v);
  }
  return out;
}

function toTools(tools: (ToolDef | ServerTool)[] = []) {
  const fns = tools.filter((t): t is ToolDef => 'input_schema' in t);
  const out: Record<string, unknown>[] = [];
  if (fns.length) {
    out.push({
      functionDeclarations: fns.map((t) => {
        const props = (t.input_schema as { properties?: Record<string, unknown> }).properties;
        const decl: Record<string, unknown> = { name: t.name, description: t.description };
        if (props && Object.keys(props).length) decl.parameters = sanitizeSchema(t.input_schema);
        return decl;
      }),
    });
  }
  if (tools.some((t) => !('input_schema' in t))) out.push({ googleSearch: {} });
  return out;
}

type Part =
  | { text: string }
  | { functionCall: { name: string; args: unknown; id?: string }; thoughtSignature?: string }
  | { functionResponse: { name: string; id?: string; response: Record<string, unknown> } };

function toContents(messages: Parameters<Adapter['build']>[0]['messages']) {
  const names = new Map<string, string>();
  const contents: { role: 'user' | 'model'; parts: Part[] }[] = [];
  for (const m of messages) {
    const role = m.role === 'assistant' ? 'model' : 'user';
    const parts: Part[] = [];
    if (typeof m.content === 'string') parts.push({ text: m.content });
    else
      for (const b of m.content) {
        if (b.type === 'text' && b.text) parts.push({ text: b.text });
        else if (b.type === 'tool_use') {
          names.set(b.id, b.name);
          const p: Part = { functionCall: { name: b.name, args: b.input ?? {}, id: b.id } };
          if (b.signature) (p as { thoughtSignature?: string }).thoughtSignature = b.signature;
          parts.push(p);
        } else if (b.type === 'tool_result') {
          parts.push({ functionResponse: { name: names.get(b.tool_use_id) ?? 'tool', id: b.tool_use_id, response: b.is_error ? { error: b.content } : { result: b.content } } });
        }
      }
    if (parts.length) contents.push({ role, parts });
  }
  return contents;
}

interface Cand {
  content?: { parts?: ({ text?: string; thought?: boolean; thoughtSignature?: string; functionCall?: { name: string; args?: unknown; id?: string } })[] };
  finishReason?: string;
  groundingMetadata?: { webSearchQueries?: string[] };
}

let seq = 0;

export const geminiAdapter: Adapter = {
  id: 'gemini',
  build(req, model, key) {
    const body: Record<string, unknown> = {
      systemInstruction: { parts: [{ text: req.system.map((s) => s.text).join('\n\n') }] },
      contents: toContents(req.messages),
      generationConfig: { maxOutputTokens: Math.max(req.max_tokens * 2, 1024), ...(req.temperature !== undefined ? { temperature: req.temperature } : {}) },
    };
    const tools = toTools(req.tools);
    if (tools.length) body.tools = tools;
    return {
      url: `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
      init: { method: 'POST', headers: { 'content-type': 'application/json', 'x-goog-api-key': key.key }, body: JSON.stringify(body) },
    };
  },
  parse(json) {
    const r = json as { responseId?: string; candidates?: Cand[]; promptFeedback?: { blockReason?: string }; usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; thoughtsTokenCount?: number; cachedContentTokenCount?: number } };
    const cand = r.candidates?.[0];
    const content: ContentBlock[] = [];
    for (const p of cand?.content?.parts ?? []) {
      if (p.functionCall) {
        content.push({ type: 'tool_use', id: p.functionCall.id ?? `g${Date.now().toString(36)}${seq++}`, name: p.functionCall.name, input: p.functionCall.args ?? {}, signature: p.thoughtSignature });
      } else if (p.text && !p.thought) content.push({ type: 'text', text: p.text });
    }
    const u = r.usageMetadata ?? {};
    const cached = u.cachedContentTokenCount ?? 0;
    const stop: ApiResponse['stop_reason'] = content.some((b) => b.type === 'tool_use')
      ? 'tool_use'
      : cand?.finishReason === 'MAX_TOKENS'
        ? 'max_tokens'
        : r.promptFeedback?.blockReason || cand?.finishReason === 'SAFETY'
          ? 'refusal'
          : 'end_turn';
    return {
      id: r.responseId ?? `gemini-${seq++}`,
      content,
      stop_reason: stop,
      usage: {
        input_tokens: Math.max(0, (u.promptTokenCount ?? 0) - cached),
        output_tokens: (u.candidatesTokenCount ?? 0) + (u.thoughtsTokenCount ?? 0),
        cache_read_input_tokens: cached,
        server_tool_use: { web_search_requests: cand?.groundingMetadata?.webSearchQueries?.length ?? 0 },
      },
    };
  },
  classify(status, body) {
    const msg = errorMessage(body);
    if (/api key not valid|api_key_invalid|permission/i.test(msg) || status === 401 || status === 403) return { kind: 'invalid', message: 'chiave non valida' };
    if (status === 429 && /billing|exceeded your current quota|credits/i.test(msg)) return { kind: 'exhausted', message: 'quota o credito esauriti' };
    if (status === 429) return { kind: 'rate', message: 'troppe richieste' };
    if (status >= 500) return { kind: 'temporary', message: 'servizio non disponibile' };
    return { kind: 'fatal', message: msg || `errore ${status}` };
  },
};
