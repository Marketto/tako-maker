/* Proxy opzionale per l'API Claude (Cloudflare Worker).
   Tiene la chiave sul server: il sito pubblico non la contiene mai.
   Protezioni:
   - codice di accesso (header x-access-code) noto solo a te / ai tuoi familiari;
   - origine consentita (il tuo dominio GitHub Pages);
   - solo l'endpoint /v1/messages, solo i modelli previsti, max_tokens limitato;
   - strumenti lato server limitati alla ricerca web con al massimo 3 usi.
   Imposta comunque un limite di spesa sulla chiave nella Claude Console. */

const ALLOWED_MODELS = ['claude-haiku-5-5', 'claude-sonnet-5-5'];
const MAX_TOKENS = 8000;

function cors(origin) {
  return {
    'access-control-allow-origin': origin,
    'access-control-allow-methods': 'POST, OPTIONS',
    'access-control-allow-headers': 'content-type, anthropic-version, x-access-code',
    'access-control-max-age': '86400',
    vary: 'origin',
  };
}

function json(status, body, origin) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...cors(origin) } });
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('origin') ?? '';
    const allowed = (env.ALLOWED_ORIGIN ?? '').split(',').map((s) => s.trim()).filter(Boolean);
    const okOrigin = allowed.length === 0 || allowed.includes(origin);
    const replyOrigin = okOrigin ? origin : 'null';

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(replyOrigin) });
    const url = new URL(request.url);
    if (request.method !== 'POST' || url.pathname !== '/v1/messages') return json(404, { error: { message: 'Not found' } }, replyOrigin);
    if (!okOrigin) return json(403, { error: { message: 'Origine non consentita' } }, replyOrigin);
    if (!env.ACCESS_CODE || request.headers.get('x-access-code') !== env.ACCESS_CODE) {
      return json(401, { error: { message: 'Codice di accesso non valido' } }, replyOrigin);
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return json(400, { error: { message: 'JSON non valido' } }, replyOrigin);
    }
    if (!ALLOWED_MODELS.includes(body.model)) return json(400, { error: { message: 'Modello non consentito' } }, replyOrigin);
    body.max_tokens = Math.min(Number(body.max_tokens) || 1000, MAX_TOKENS);
    if (Array.isArray(body.tools)) {
      body.tools = body.tools.filter((t) => !t.type || t.type.startsWith('web_search'));
      for (const t of body.tools) if (t.type) t.max_uses = Math.min(t.max_uses ?? 3, 3);
    }

    const upstream = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'anthropic-version': request.headers.get('anthropic-version') ?? '2023-06-01',
        'x-api-key': env.ANTHROPIC_API_KEY,
      },
      body: JSON.stringify(body),
    });
    return new Response(upstream.body, { status: upstream.status, headers: { 'content-type': 'application/json', ...cors(replyOrigin) } });
  },
};
