/**
 * The Moving Dot — agent chat worker.
 *
 * Contract (kept compatible with the site widget):
 *   POST /chat  { messages: [{role, content}, ...] }
 *   ->          { reply: string, actions: [{tool, args}], response: string }
 *
 * The model is instructed (by the site's system prompt) to answer with a JSON
 * envelope {"say": "...", "actions": [...]}. This worker extracts that
 * envelope, validates every action against the whitelist below, and returns
 * plain text plus safe actions. If the model ignores the protocol, its raw
 * text becomes the reply and no actions are emitted.
 */

// Tried in order — if Cloudflare deprecates one (error 5xxx), the next is used.
const MODELS = [
  '@cf/meta/llama-4-scout-17b-16e-instruct',
  '@cf/openai/gpt-oss-120b',
  '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
];

const PAGES = ['home', 'product', 'lab', 'flow', 'survey'];
const PROJECT_HOSTS = ['themovingdot.com', 'whereistherainbowbus.netlify.app'];

const MAX_MESSAGES = 24;
const MAX_CONTENT_CHARS = 9000;
const MAX_TOKENS = 700;

// Best-effort per-isolate rate limit (resets when the isolate recycles).
const RATE_LIMIT = { windowMs: 5 * 60 * 1000, max: 20 };
const hits = new Map();

function rateLimited(ip) {
  const now = Date.now();
  const arr = (hits.get(ip) || []).filter(t => now - t < RATE_LIMIT.windowMs);
  if (arr.length >= RATE_LIMIT.max) return true;
  arr.push(now);
  hits.set(ip, arr);
  if (hits.size > 5000) hits.clear();
  return false;
}

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS },
  });
}

/* ---------------- action validation ---------------- */

function validUrl(u) {
  try {
    const url = new URL(u);
    if (url.protocol !== 'https:') return false;
    return PROJECT_HOSTS.some(h => url.hostname === h || url.hostname.endsWith('.' + h));
  } catch {
    return false;
  }
}

const str = (v, max) => typeof v === 'string' && v.length > 0 && v.length <= max;

const VALIDATORS = {
  go_to_page: a => PAGES.includes(a.page),
  show_card: a => str(a.card, 60) && /^[a-z0-9-]+$/.test(a.card),
  open_project: a => validUrl(a.url),
  set_theme: a => a.theme === 'light' || a.theme === 'dark',
  set_mood: a =>
    (a.mood === undefined || ['calm', 'normal', 'storm'].includes(a.mood)) &&
    (a.color === undefined || ['purple', 'blue', 'red', 'yellow', 'rainbow'].includes(a.color)),
  constellation: a => str(a.text, 14) && /^[a-zA-Z0-9 .À-ɏ]+$/.test(a.text),
  draft_email: a => str(a.subject, 150) && str(a.body, 2000),
};

function sanitizeActions(actions) {
  if (!Array.isArray(actions)) return [];
  const out = [];
  for (const act of actions.slice(0, 6)) {
    if (!act || typeof act.tool !== 'string') continue;
    const check = VALIDATORS[act.tool];
    const args = (act.args && typeof act.args === 'object') ? act.args : {};
    if (check && check(args)) out.push({ tool: act.tool, args });
  }
  return out;
}

/* ---------------- model output parsing ---------------- */

// Pull the first balanced {...} block out of the text (models love to wrap
// JSON in prose or ```json fences).
function extractJson(text) {
  const cleaned = text.replace(/```(?:json)?/g, '');
  const start = cleaned.indexOf('{');
  if (start === -1) return null;
  let depth = 0, inStr = false, esc = false;
  for (let i = start; i < cleaned.length; i++) {
    const c = cleaned[i];
    if (esc) { esc = false; continue; }
    if (c === '\\') { esc = true; continue; }
    if (c === '"') inStr = !inStr;
    if (inStr) continue;
    if (c === '{') depth++;
    if (c === '}') {
      depth--;
      if (depth === 0) {
        try { return JSON.parse(cleaned.slice(start, i + 1)); } catch { return null; }
      }
    }
  }
  return null;
}

function modelText(result) {
  if (typeof result === 'string') return result;
  if (typeof result?.response === 'string') return result.response;
  if (typeof result?.output_text === 'string') return result.output_text;
  const choice = result?.choices?.[0];
  if (typeof choice?.message?.content === 'string') return choice.message.content;
  return '';
}

/* ---------------- request handling ---------------- */

function cleanMessages(raw) {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const msgs = raw.slice(-MAX_MESSAGES).map(m => ({
    role: ['system', 'user', 'assistant'].includes(m?.role) ? m.role : 'user',
    content: String(m?.content ?? '').slice(0, MAX_CONTENT_CHARS),
  })).filter(m => m.content.length > 0);
  return msgs.length ? msgs : null;
}

async function runModel(env, messages) {
  let lastErr;
  for (const model of MODELS) {
    try {
      const result = await env.AI.run(model, {
        messages,
        max_tokens: MAX_TOKENS,
        temperature: 0.6,
      });
      const text = modelText(result);
      if (text) return { text, model };
      lastErr = new Error('empty response from ' + model);
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr || new Error('all models failed');
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });

    const url = new URL(request.url);
    if (request.method !== 'POST' || url.pathname !== '/chat') {
      return json({ error: 'POST /chat only' }, 404);
    }

    const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
    if (rateLimited(ip)) {
      return json({ error: 'Too many requests — please slow down a little.' }, 429);
    }

    let body;
    try { body = await request.json(); } catch { return json({ error: 'invalid JSON body' }, 400); }
    const messages = cleanMessages(body?.messages);
    if (!messages) return json({ error: 'messages array required' }, 400);

    try {
      const { text, model } = await runModel(env, messages);
      const envelope = extractJson(text);
      const reply = (typeof envelope?.say === 'string' && envelope.say.trim())
        ? envelope.say.trim()
        : (envelope ? '' : text.trim());
      const actions = sanitizeActions(envelope?.actions);
      return json({ reply, actions, response: reply, model });
    } catch (err) {
      return json({ error: 'The assistant is unavailable right now: ' + (err?.message || 'unknown error') }, 502);
    }
  },
};
