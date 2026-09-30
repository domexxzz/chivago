import { strict as assert } from 'node:assert';
import { test, describe, before } from 'node:test';

/**
 * The traveller's side of an inquiry, over the wire. docs/61, stage three.
 *
 * `inquiry-service.test.ts` proves the rules. This proves the wiring a phone
 * sees: what is public, what needs an account, that a second traveller cannot
 * read or withdraw the first's questions, and that an answer arrives with the
 * listing it was about.
 */

delete process.env.CHIVAGO_OPEN_IDENTITY;
process.env.CHIVAGO_DB = ':memory:';

const { app, db } = await import('./server.ts');
const { addListing, answerInquiry } = await import('./inquiry-service.ts');

type Body = { ok: boolean; data?: any; code?: string; error?: string; problems?: string[]; meta?: any };
const json = async (res: Response) => (await res.json()) as Body;
const post = (path: string, body: unknown, key?: string) =>
  app.request(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(key ? { 'x-chivago-device-key': key } : {}) },
    body: JSON.stringify(body ?? {}),
  });
const get = (path: string, key?: string) =>
  app.request(path, { headers: key ? { 'x-chivago-device-key': key } : {} });

const daysAhead = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

let ana: string;
let bo: string;
let listingId: string;

before(async () => {
  ana = (await json(await post('/devices', { displayName: 'Ana', label: 'Ana' }))).data.deviceKey;
  bo = (await json(await post('/devices', { displayName: 'Bo', label: 'Bo' }))).data.deviceKey;
  db.prepare("INSERT INTO hosts (id,name,type) VALUES ('op-boat','Thong Krut Boat Co-op','company')").run();
  listingId = addListing(db, {
    operatorId: 'op-boat', kind: 'tour', titleEn: 'Longtail to Koh Taen', titleTh: 'เรือหางยาวไปเกาะแตน',
    whereLabel: 'Thong Krut pier', licenceNo: '31/01234',
  }).id;
});

describe('what anybody using the app can see', () => {
  test('any traveller with a device sees the listings', async () => {
    const res = await json(await get('/listings', bo));
    assert.equal(res.ok, true, JSON.stringify(res));
    assert.equal(res.data.length, 1);
    assert.equal(res.data[0].title.th, 'เรือหางยาวไปเกาะแตน');
    assert.equal(res.data[0].licenceNo, '31/01234');
  });

  test('A REAL OPERATOR’S LISTING IS NEVER MARKED AS AN EXAMPLE', async () => {
    // A listing here is a claim a real business made; nothing may label it
    // otherwise, and the key is absent rather than false.
    const res = await json(await get('/listings', bo));
    for (const l of res.data) assert.equal('example' in l, false, JSON.stringify(l));
    const mine = await json(await get('/inquiries', ana));
    for (const i of mine.data) assert.equal('example' in i.listing, false);
  });

  test('LISTINGS ARE BEHIND A DEVICE KEY, EXACTLY AS OFFERS ARE', async () => {
    // Not on the public list. Showing listings to the open web is its own
    // decision, and this test is here so that making it is deliberate.
    for (const path of ['/listings', '/offers']) {
      const res = await get(path);
      assert.equal(res.status, 401, `${path} answered without a device`);
    }
  });

  test('a new operator has no response time yet, rather than a flattering one', async () => {
    const res = await json(await get('/listings', ana));
    assert.equal(res.data[0].responseHours, null);
  });
});

describe('asking', () => {
  test('a traveller sends an inquiry and it comes back sent', async () => {
    const res = await json(await post(`/listings/${listingId}/inquiries`, {
      forDate: daysAhead(4), partySize: 2, message: 'Two of us, Saturday morning?',
    }, ana));
    assert.equal(res.ok, true, JSON.stringify(res));
    assert.equal(res.data.now, 'sent');
  });

  test('EVERY PROBLEM COMES BACK AT ONCE, AS A LIST', async () => {
    const res = await json(await post(`/listings/${listingId}/inquiries`, {
      forDate: 'someday', partySize: 0, message: '',
    }, ana));
    assert.equal(res.ok, false);
    assert.equal(res.code, 'INVALID_INQUIRY');
    assert.deepEqual(res.problems, ['party_size', 'message', 'date_format']);
    // And the message itself names them: it is what the phone shows, and
    // "not complete" alone would leave nothing to fix.
    assert.match(res.error!, /Say how many people/);
    assert.match(res.error!, /Write a question for the operator/);
    assert.match(res.error!, /Choose the day/);
  });

  test('a listing that does not exist takes no questions', async () => {
    const res = await json(await post('/listings/nope/inquiries', {
      forDate: daysAhead(4), partySize: 2, message: 'hello',
    }, ana));
    assert.equal(res.ok, false);
  });
});

describe('reading your own questions', () => {
  test('THE ANSWER ARRIVES WITH THE LISTING IT WAS ABOUT', async () => {
    const sent = await json(await post(`/listings/${listingId}/inquiries`, {
      forDate: daysAhead(5), partySize: 3, message: 'Three of us?',
    }, ana));
    answerInquiry(db, {
      operatorId: 'op-boat', inquiryId: sent.data.id, answer: 'Yes, 8am.', quoteTHB: 3200,
    });
    const mine = await json(await get('/inquiries', ana));
    const answered = mine.data.find((i: any) => i.id === sent.data.id);
    assert.equal(answered.now, 'answered');
    assert.equal(answered.answer, 'Yes, 8am.');
    assert.equal(answered.quoteTHB, 3200);
    assert.equal(answered.listing.operatorName, 'Thong Krut Boat Co-op');
    assert.equal(answered.listing.title.th, 'เรือหางยาวไปเกาะแตน');
  });

  test('A SECOND TRAVELLER SEES NONE OF THE FIRST’S QUESTIONS', async () => {
    const theirs = await json(await get('/inquiries', bo));
    assert.equal(theirs.data.length, 0);
  });

  test('A SECOND TRAVELLER CANNOT WITHDRAW THE FIRST’S QUESTION', async () => {
    const sent = await json(await post(`/listings/${listingId}/inquiries`, {
      forDate: daysAhead(6), partySize: 1, message: 'Just me?',
    }, ana));
    const res = await json(await post(`/inquiries/${sent.data.id}/withdraw`, {}, bo));
    assert.equal(res.ok, false);
    const mine = await json(await get('/inquiries', ana));
    assert.equal(mine.data.find((i: any) => i.id === sent.data.id).now, 'sent');
  });

  test('the traveller who asked can withdraw it', async () => {
    const sent = await json(await post(`/listings/${listingId}/inquiries`, {
      forDate: daysAhead(7), partySize: 1, message: 'Changed my mind soon',
    }, ana));
    const res = await json(await post(`/inquiries/${sent.data.id}/withdraw`, {}, ana));
    assert.equal(res.ok, true);
    assert.equal(res.data.now, 'withdrawn');
  });

  test('NOTHING THE TRAVELLER READS OVER THE WIRE SAYS CONFIRMED', async () => {
    const all = JSON.stringify((await json(await get('/inquiries', ana))).data).toLowerCase();
    assert.doesNotMatch(all, /confirmed/);
  });
});

/**
 * A made-up operator, on the real server.
 *
 * Two of these existed on chivago.fly.dev from 29 September, marked only by
 * their name beginning "DEMO · " - not a label, English only, and read by
 * the app as part of the business's name. The listings page also told
 * travellers the boat co-op "usually answers within 2.5 hours", a median over
 * six seeded questions that no person ever answered. Both are held here.
 */
describe('an example operator over the wire', () => {
  let cat: string;
  before(async () => {
    cat = (await json(await post('/devices', { displayName: 'Cat', label: 'Cat' }))).data.deviceKey;
    const { addHost } = await import('./add-host.ts');
    addHost(db, { id: 'op-example', name: 'Example Boat Co-op', type: 'operator', example: true });
    const example = addListing(db, {
      operatorId: 'op-example', kind: 'experience', titleEn: 'Sunset fishing trip',
      titleTh: 'ตกปลายามพระอาทิตย์ตก', whereLabel: 'Bang Rak', fromTHB: 1200,
    }).id;
    // Enough answered questions that a real operator would be shown a median.
    for (let i = 0; i < 6; i += 1) {
      const sent = await json(await post(`/listings/${example}/inquiries`,
        { forDate: daysAhead(3 + i), partySize: 2, message: 'Is it free?' }, cat));
      answerInquiry(db, { operatorId: 'op-example', inquiryId: sent.data.id, answer: 'Yes', quoteTHB: 1200 });
    }
  });

  test('EVERY LISTING OF AN EXAMPLE OPERATOR IS MARKED AS ONE', async () => {
    const listings = (await json(await get('/listings', cat))).data as
      { operatorId: string; example?: true; responseHours: number | null }[];
    const mine = listings.filter((l) => l.operatorId === 'op-example');
    assert.ok(mine.length > 0, 'the example operator has no listings');
    for (const l of mine) assert.equal(l.example, true, JSON.stringify(l));
  });

  test('AN EXAMPLE OPERATOR IS SHOWN NO RESPONSE TIME, HOWEVER MANY ANSWERS SIT BEHIND IT', async () => {
    const listings = (await json(await get('/listings', cat))).data as
      { operatorId: string; responseHours: number | null }[];
    for (const l of listings.filter((x) => x.operatorId === 'op-example')) {
      assert.equal(l.responseHours, null, 'a made-up operator was given a response time');
    }
  });

  test('and the traveller’s own list of questions says so too', async () => {
    const mine = (await json(await get('/inquiries', cat))).data as { listing: { example?: true } }[];
    assert.ok(mine.length > 0);
    for (const i of mine) assert.equal(i.listing.example, true, JSON.stringify(i.listing));
  });

  test('a real operator on the same server keeps its response time', async () => {
    // The mark is per operator, not a switch that quiets the whole server.
    const { medianResponseHours } = await import('./inquiry-service.ts');
    assert.equal(medianResponseHours(db, 'op-example'), null);
    for (let i = 0; i < 6; i += 1) {
      const sent = await json(await post(`/listings/${listingId}/inquiries`,
        { forDate: daysAhead(3 + i), partySize: 2, message: 'Room?' }, cat));
      answerInquiry(db, { operatorId: 'op-boat', inquiryId: sent.data.id, answer: 'Yes', quoteTHB: 900 });
    }
    assert.notEqual(medianResponseHours(db, 'op-boat'), null, 'a real operator lost its response time');
  });
});
