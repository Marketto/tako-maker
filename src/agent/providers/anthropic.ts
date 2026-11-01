import type { ApiResponse, ContentBlock, Message } from '../client';
import { errorMessage, type Adapter } from './types';

/* Claude: il formato interno è già quello della Messages API.
   Si tolgono solo i campi interni (firma del ragionamento di Gemini). */

const clean = (messages: Message[]): Message[] =>
  messages.map((m) =>
    typeof m.content === 'string'
      ? m
      : {
          ...m,
          content: m.content.map((b): ContentBlock => {
            if (b.type !== 'tool_use') return b;
            const { signature: _sig, ...rest } = b;
            return rest;
          }),
        },
  );

export const anthropicAdapter: Adapter = {
  id: 'anthropic',
  build(req, model, key) {
    const proxy = key.baseUrl?.trim();
    const url = proxy ? proxy.replace(/\/$/, '') + '/v1/messages' : 'https://api.anthropic.com/v1/messages';
    const headers: Record<string, string> = { 'content-type': 'application/json', 'anthropic-version': '2023-06-01' };
    if (proxy) {
      if (key.accessCode) headers['x-access-code'] = key.accessCode;
    } else {
      headers['x-api-key'] = key.key;
      headers['anthropic-dangerous-direct-browser-access'] = 'true';
    }
    const body = {
      model,
      max_tokens: req.max_tokens,
      system: req.system,
      messages: clean(req.messages),
      tools: req.tools,
      tool_choice: req.tool_choice,
      temperature: req.temperature,
    };
    return { url, init: { method: 'POST', headers, body: JSON.stringify(body) } };
  },
  parse(json) {
    return json as ApiResponse;
  },
  classify(status, body) {
    const msg = errorMessage(body);
    if (/credit balance|billing|purchase credits/i.test(msg)) return { kind: 'exhausted', message: 'credito esaurito' };
    if (status === 401 || status === 403) return { kind: 'invalid', message: 'chiave non valida' };
    if (status === 429) return { kind: 'rate', message: 'troppe richieste' };
    if (status === 529 || status >= 500) return { kind: 'temporary', message: 'servizio sovraccarico' };
    return { kind: 'fatal', message: msg || `errore ${status}` };
  },
};
