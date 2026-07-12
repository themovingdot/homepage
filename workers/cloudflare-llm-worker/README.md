# cloudflare-llm-worker — the site's agent chat backend

Powers the chat widget on themovingdot.com. Receives the conversation,
runs it through Cloudflare Workers AI, extracts the `{"say", "actions"}`
envelope the site's system prompt asks for, validates every action, and
returns `{ reply, actions }` to the widget (which executes the actions on
the page: navigation, card highlighting, particle moods, constellations…).

## Why this rewrite

The previous worker pinned a Workers AI model that Cloudflare deprecated on
2026-05-30 (error 5028), which broke chat on every page. This version tries
a list of current models in order (`MODELS` in `src/index.js`), so a future
deprecation degrades to the next model instead of an outage. It also adds
per-IP rate limiting and strict whitelisting of the actions the model may
trigger on the page.

## Deploy

### Option A — dashboard paste (no tooling)

1. Open [dash.cloudflare.com](https://dash.cloudflare.com) → Workers & Pages
   → `cloudflare-llm-worker` → Edit code.
2. Replace the entire contents with `src/index.js` and Deploy.
3. In the worker's **Settings → Bindings**, make sure there is a
   **Workers AI** binding named `AI` (add it if missing).

The URL stays `https://cloudflare-llm-worker.hongwei-8a7.workers.dev/chat`,
so the site needs no change.

### Option B — wrangler (keeps the worker in git)

```sh
cd workers/cloudflare-llm-worker
npx wrangler login     # first time only
npx wrangler deploy
```

`wrangler.toml` already declares the `AI` binding and deploys over the
existing `cloudflare-llm-worker` name.

## Smoke test

```sh
curl -X POST https://cloudflare-llm-worker.hongwei-8a7.workers.dev/chat \
  -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"user","content":"hello"}]}'
```

Expect `{"reply":"...","actions":[...]}` — not an error object.

## Local test (no Cloudflare account needed)

```sh
node test/worker.test.mjs
```

Runs the fetch handler with a mocked `env.AI` and asserts envelope parsing,
action validation, model fallback, and rate limiting.
