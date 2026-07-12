// Offline tests for the agent worker: mocked env.AI, real fetch handler.
import worker from '../src/index.js';
import assert from 'node:assert';

let calls = [];
function makeEnv(script) {
  // script: array of responses/throws consumed per AI.run call
  let i = 0;
  return {
    AI: {
      async run(model, opts) {
        calls.push({ model, opts });
        const step = script[Math.min(i++, script.length - 1)];
        if (step instanceof Error) throw step;
        return step;
      },
    },
  };
}

function req(body, ip = '1.2.3.4') {
  return new Request('https://x.workers.dev/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': ip },
    body: JSON.stringify(body),
  });
}

const msgs = [{ role: 'user', content: 'show me riyadh work' }];

// 1. Happy path: JSON envelope with valid + invalid actions
{
  calls = [];
  const env = makeEnv([{
    response: 'Sure! ```json\n{"say":"Here is the Riyadh survey.","actions":[' +
      '{"tool":"go_to_page","args":{"page":"product"}},' +
      '{"tool":"show_card","args":{"card":"riyadh-metro-survey"}},' +
      '{"tool":"show_card","args":{"card":"<script>alert(1)</script>"}},' +
      '{"tool":"open_project","args":{"url":"http://evil.example.com"}},' +
      '{"tool":"set_theme","args":{"theme":"light"}}]}\n```',
  }]);
  const res = await worker.fetch(req({ messages: msgs }), env);
  const out = await res.json();
  assert.equal(res.status, 200);
  assert.equal(out.reply, 'Here is the Riyadh survey.');
  assert.deepEqual(out.actions.map(a => a.tool), ['go_to_page', 'show_card', 'set_theme']);
  assert.equal(out.response, out.reply); // legacy field
  console.log('ok 1: envelope parsing + action whitelist');
}

// 2. Model ignores protocol -> raw text becomes reply, no actions
{
  const env = makeEnv([{ response: 'Just a plain answer with no JSON.' }]);
  const out = await (await worker.fetch(req({ messages: msgs }, '2.2.2.2'), env)).json();
  assert.equal(out.reply, 'Just a plain answer with no JSON.');
  assert.deepEqual(out.actions, []);
  console.log('ok 2: plain-text fallback');
}

// 3. Model fallback chain: first model deprecated, second succeeds
{
  calls = [];
  const env = makeEnv([
    new Error('5028: This model was deprecated'),
    { response: '{"say":"hello from fallback","actions":[]}' },
  ]);
  const out = await (await worker.fetch(req({ messages: msgs }, '3.3.3.3'), env)).json();
  assert.equal(out.reply, 'hello from fallback');
  assert.equal(calls.length, 2);
  assert.notEqual(calls[0].model, calls[1].model);
  console.log('ok 3: model fallback on deprecation');
}

// 4. All models fail -> 502 with error
{
  const env = makeEnv([new Error('boom')]);
  const res = await worker.fetch(req({ messages: msgs }, '4.4.4.4'), env);
  assert.equal(res.status, 502);
  assert.match((await res.json()).error, /unavailable/);
  console.log('ok 4: 502 when all models fail');
}

// 5. Bad input -> 400
{
  const env = makeEnv([{ response: 'x' }]);
  assert.equal((await worker.fetch(req({ nope: 1 }, '5.5.5.5'), env)).status, 400);
  assert.equal((await worker.fetch(req({ messages: [] }, '5.5.5.5'), env)).status, 400);
  console.log('ok 5: 400 on bad input');
}

// 6. Rate limit: 21st request within window -> 429
{
  const env = makeEnv([{ response: '{"say":"hi","actions":[]}' }]);
  let last;
  for (let i = 0; i < 21; i++) last = await worker.fetch(req({ messages: msgs }, '6.6.6.6'), env);
  assert.equal(last.status, 429);
  console.log('ok 6: rate limiting');
}

// 7. constellation + mood validation
{
  const env = makeEnv([{
    response: '{"say":"watch this","actions":[' +
      '{"tool":"constellation","args":{"text":"HELLO"}},' +
      '{"tool":"constellation","args":{"text":"way too long for the sky"}},' +
      '{"tool":"set_mood","args":{"color":"rainbow","mood":"storm"}},' +
      '{"tool":"set_mood","args":{"color":"neon-green"}}]}',
  }]);
  const out = await (await worker.fetch(req({ messages: msgs }, '7.7.7.7'), env)).json();
  assert.deepEqual(out.actions, [
    { tool: 'constellation', args: { text: 'HELLO' } },
    { tool: 'set_mood', args: { color: 'rainbow', mood: 'storm' } },
  ]);
  console.log('ok 7: constellation/mood validation');
}

console.log('\nall worker tests passed');
