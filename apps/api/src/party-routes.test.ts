import { strict as assert } from 'node:assert';
import { test, describe, before } from 'node:test';

/**
 * Parties, over HTTP.
 *
 * `party-service.test.ts` proves the rules. This proves the wiring: that two
 * separately authenticated people reach the same group, that the four refusals
 * arrive as four different sentences, and — the one worth having at this
 * level — that forming a party moves nobody's wallet.
 */

delete process.env.CHIVAGO_OPEN_IDENTITY;
process.env.CHIVAGO_DB = ':memory:';

const { app } = await import('./server.ts');

type Body = { ok: boolean; data?: any; code?: string; error?: string };
const json = async (res: Response) => (await res.json()) as Body;

const post = (path: string, body: unknown, key?: string) =>
  app.request(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(key ? { 'x-chivago-device-key': key } : {}) },
    body: JSON.stringify(body ?? {}),
  });

const get = (path: string, key: string) =>
  app.request(path, { headers: { 'x-chivago-device-key': key } });

const register = async (label: string) =>
  (await json(await post('/devices', { displayName: label, label }))).data.deviceKey as string;

let ana: string;
let bo: string;

before(async () => {
  ana = await register('Ana');
  bo = await register('Bo');
});

describe('starting and joining', () => {
  test('solo is a state the API answers with, not an error', async () => {
    const res = await json(await get('/party', ana));
    assert.equal(res.ok, true);
    assert.equal(res.data.party, null);
    assert.equal(res.data.summary.kind, 'solo');
    assert.equal(res.data.summary.size, 0);
  });

  test('every answer carries what a party does not do', async () => {
    // "Do we all get the points" is the first question anybody asks, so the
    // answer travels with the data rather than living in a help page.
    const res = await json(await get('/party', ana));
    const said = res.data.doesNot.map((d: { en: string }) => d.en).join(' ');
    assert.match(said, /Share points/i);
    assert.match(said, /balance/i);
  });

  test('two people reach the same group through a code', async () => {
    const made = await json(await post('/party', { name: 'Songkran trip' }, ana));
    assert.equal(made.ok, true);
    assert.match(made.data.code, /^[2-9A-HJKMNP-Z]{6}$/);

    const joined = await json(await post('/party/join', { code: made.data.code }, bo));
    assert.equal(joined.ok, true);
    assert.equal(joined.data.party.id, made.data.party.id);

    const seen = await json(await get('/party', bo));
    assert.equal(seen.data.summary.kind, 'duo');
    assert.equal(seen.data.summary.size, 2);
    assert.deepEqual(
      seen.data.summary.members.map((m: { displayName: string }) => m.displayName).sort(),
      ['Ana', 'Bo'],
    );
    assert.equal(seen.data.summary.members.find((m: any) => m.displayName === 'Bo').you, true);
  });

  test('forming a party moves nobody’s wallet', async () => {
    // The whole design in one assertion. If this ever fails, Green Points have
    // stopped meaning "a named host checked this".
    const before = (await json(await get('/wallet', bo))).data.balances;
    const made = await json(await post('/party', { name: 'Another trip' }, ana));
    await post('/party/join', { code: made.data.code }, bo);
    const after = (await json(await get('/wallet', bo))).data.balances;
    assert.deepEqual(after, before);
  });

  test('no member row ever carries a balance', async () => {
    const res = await get('/party', bo);
    const text = await res.text();
    const member = (await json(await get('/party', bo))).data.summary.members[0];
    for (const forbidden of ['balance', 'balances', 'spent']) {
      assert.ok(!(forbidden in member), `a member row grew ${forbidden}`);
    }
    assert.doesNotMatch(text, /"balances?"/, 'a balance leaked into the party payload');
  });
});

describe('the four refusals are four sentences', () => {
  test('a code nobody issued', async () => {
    const res = await json(await post('/party/join', { code: 'ZZZZZZ' }, bo));
    assert.equal(res.code, 'PARTY_UNKNOWN');
    assert.match(res.error!, /No party is using that code/);
  });

  test('already in it', async () => {
    const made = await json(await post('/party', { name: 'Trip' }, ana));
    await post('/party/join', { code: made.data.code }, bo);
    const again = await json(await post('/party/join', { code: made.data.code }, bo));
    assert.equal(again.code, 'PARTY_ALREADY_IN');
    assert.match(again.error!, /already in this party/i);
  });

  test('a missing code is a sentence, not a stack trace', async () => {
    const res = await json(await post('/party/join', {}, bo));
    assert.equal(res.code, 'CODE_REQUIRED');
    assert.match(res.error!, /whoever started the group/);
  });

  test('a disbanded party', async () => {
    const made = await json(await post('/party', { name: 'Short trip' }, ana));
    assert.equal((await json(await post('/party/disband', {}, ana))).ok, true);
    const res = await json(await post('/party/join', { code: made.data.code }, bo));
    assert.equal(res.code, 'PARTY_DISBANDED');
  });
});

describe('leaving and disbanding', () => {
  test('leaving drops you to solo and leaves the group standing', async () => {
    const made = await json(await post('/party', { name: 'Trip' }, ana));
    await post('/party/join', { code: made.data.code }, bo);

    assert.equal((await json(await post('/party/leave', {}, bo))).data.left, true);
    assert.equal((await json(await get('/party', bo))).data.party, null);
    assert.equal((await json(await get('/party', ana))).data.summary.size, 1);
  });

  test('only the founder can disband', async () => {
    const made = await json(await post('/party', { name: 'Trip' }, ana));
    await post('/party/join', { code: made.data.code }, bo);
    const res = await post('/party/disband', {}, bo);
    assert.equal(res.status, 403);
    assert.match((await json(res)).error!, /Only whoever started this group/);
  });

  test('disbanding when you are in no group says so', async () => {
    await post('/party/leave', {}, bo);
    const res = await post('/party/disband', {}, bo);
    assert.equal(res.status, 404);
  });
});
