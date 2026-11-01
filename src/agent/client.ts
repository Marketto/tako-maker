import type { ModelTier } from './config';
import type { Usage } from './budget';

/* Formato interno dei messaggi: quello della Messages API di Claude.
   Gli adattatori in providers/ lo traducono per OpenAI e Gemini, e il
   KeyRouter sceglie la chiave da usare (vedi docs/AGENTI.md). */

export type ContentBlock =
  | { type: 'text'; text: string; cache_control?: CacheControl }
  | { type: 'tool_use'; id: string; name: string; input: unknown; /** Firma del ragionamento (Gemini), da rimandare tale e quale. */ signature?: string }
  | { type: 'tool_result'; tool_use_id: string; content: string; is_error?: boolean }
  | { type: 'server_tool_use'; id: string; name: string; input: unknown }
  | { type: 'web_search_tool_result'; tool_use_id: string; content: unknown };

export interface CacheControl {
  type: 'ephemeral';
}

export interface Message {
  role: 'user' | 'assistant';
  content: string | ContentBlock[];
}

export interface ToolDef {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
  cache_control?: CacheControl;
}

export interface ServerTool {
  type: string;
  name: string;
  [k: string]: unknown;
}

export interface ApiRequest {
  tier: ModelTier;
  system: { type: 'text'; text: string; cache_control?: CacheControl }[];
  messages: Message[];
  tools?: (ToolDef | ServerTool)[];
  tool_choice?: { type: 'auto' | 'any' | 'none' } | { type: 'tool'; name: string };
  max_tokens: number;
  temperature?: number;
}

export interface ApiResponse {
  id: string;
  content: ContentBlock[];
  stop_reason: 'end_turn' | 'tool_use' | 'max_tokens' | 'stop_sequence' | 'pause_turn' | 'refusal' | null;
  usage: Usage;
}

export class ApiError extends Error {
  constructor(message: string, public status?: number) {
    super(message);
  }
}

/** Interfaccia comune usata da runner e router delle skill. */
export interface AiClient {
  isConfigured(): boolean;
  send(req: ApiRequest, signal?: AbortSignal): Promise<ApiResponse & { costUsd: number; provider?: string; keyLabel?: string }>;
}

/** Marca l'ultimo elemento come punto di cache (prompt caching). */
export function withCache<T extends object>(list: T[]): T[] {
  if (!list.length) return list;
  const copy = list.slice();
  copy[copy.length - 1] = { ...copy[copy.length - 1], cache_control: { type: 'ephemeral' } };
  return copy;
}
