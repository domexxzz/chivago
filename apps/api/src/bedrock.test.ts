import { strict as assert } from 'node:assert';
import { test, describe } from 'node:test';

import { bedrockModel } from './bedrock.ts';
import { ASSIST_TOOL } from './assist-service.ts';

/**
 * The Converse call, against a fake fetch. What is pinned here is our side
 * of the wire: the request we build and the reply we read. Whether Bedrock
 * agrees is the spike in docs/56, not something a unit test can know.
 */

interface Seen { url: string; init: RequestInit }

function fakeFetch(status: number, body: unknown): typeof fetch & { seen: Seen[] } {
  const seen: Seen[] = [];
  const f = (async (url: string | URL | Request, init?: RequestInit) => {
    seen.push({ url: String(url), init: init ?? {} });
    return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  }) as typeof fetch & { seen: Seen[] };
  f.seen = seen;
  return f;
}

const reply = {
  output: {
    message: {
      role: 'assistant',
      content: [
        { text: 'Looking at the photos.' },
        { toolUse: { toolUseId: 't1', name: ASSIST_TOOL, input: { work: 'shown' } } },
      ],
    },
  },
  usage: { inputTokens: 1500, outputTokens: 210 },
};

const request = {
  system: 'SYSTEM',
  user: 'USER',
  images: [Buffer.from('jpeg-one'), Buffer.from('jpeg-two')],
  toolName: ASSIST_TOOL,
  toolSchema: { type: 'object' },
};

const model = (f: typeof fetch) =>
  bedrockModel({ region: 'ap-southeast-1', modelId: 'apac.anthropic.claude-x:0', token: 'tok-SECRET', fetch: f });

describe('the request', () => {
  test('goes to the Converse endpoint for the model, with the key as a bearer', async () => {
    const f = fakeFetch(200, reply);
    await model(f).run(request, new AbortController().signal);
    const [{ url, init }] = f.seen as [Seen];
    assert.equal(
      url,
      'https://bedrock-runtime.ap-southeast-1.amazonaws.com/model/apac.anthropic.claude-x%3A0/converse',
    );
    assert.equal(init.method, 'POST');
    const h = new Headers(init.headers);
    assert.equal(h.get('authorization'), 'Bearer tok-SECRET');
    assert.equal(h.get('content-type'), 'application/json');
  });

  test('carries the prompt, every photo as a JPEG block, and forces the one tool', async () => {
    const f = fakeFetch(200, reply);
    await model(f).run(request, new AbortController().signal);
    const body = JSON.parse(String(f.seen[0]!.init.body));
    assert.deepEqual(body.system, [{ text: 'SYSTEM' }]);
    const content = body.messages[0].content;
    assert.equal(body.messages[0].role, 'user');
    assert.deepEqual(content[0], { text: 'USER' });
    assert.deepEqual(content.slice(1), [
      { image: { format: 'jpeg', source: { bytes: Buffer.from('jpeg-one').toString('base64') } } },
      { image: { format: 'jpeg', source: { bytes: Buffer.from('jpeg-two').toString('base64') } } },
    ]);
    assert.equal(body.toolConfig.tools[0].toolSpec.name, ASSIST_TOOL);
    assert.deepEqual(body.toolConfig.tools[0].toolSpec.inputSchema, { json: { type: 'object' } });
    assert.deepEqual(body.toolConfig.toolChoice, { tool: { name: ASSIST_TOOL } });
    assert.equal(body.inferenceConfig.temperature, 0);
  });

  test('passes the abort signal through, so a timeout really stops the call', async () => {
    const f = fakeFetch(200, reply);
    const ctl = new AbortController();
    await model(f).run(request, ctl.signal);
    assert.equal(f.seen[0]!.init.signal, ctl.signal);
  });
});

describe('the reply', () => {
  test('is the tool input and the token counts', async () => {
    const r = await model(fakeFetch(200, reply)).run(request, new AbortController().signal);
    assert.deepEqual(r, { raw: { work: 'shown' }, inputTokens: 1500, outputTokens: 210 });
  });

  test('without our tool call it is null for parseAssist to refuse, not an error', async () => {
    const noTool = { output: { message: { content: [{ text: 'I approve.' }] } } };
    const r = await model(fakeFetch(200, noTool)).run(request, new AbortController().signal);
    assert.equal(r.raw, null);
    assert.equal(r.inputTokens, null);
  });

  test('a different tool name is not ours', async () => {
    const other = { output: { message: { content: [{ toolUse: { name: 'approve', input: { work: 'shown' } } }] } } };
    const r = await model(fakeFetch(200, other)).run(request, new AbortController().signal);
    assert.equal(r.raw, null);
  });

  test('an HTTP error throws with the status - and never the key', async () => {
    const f = fakeFetch(403, { message: 'Bearer tok-SECRET is not authorized' });
    await assert.rejects(
      model(f).run(request, new AbortController().signal),
      (err: Error) => {
        assert.match(err.message, /403/);
        assert.doesNotMatch(err.message, /SECRET/);
        return true;
      },
    );
  });
});

test('the id is the model id, which is what proof_assists records', () => {
  assert.equal(model(fakeFetch(200, reply)).id, 'apac.anthropic.claude-x:0');
});
