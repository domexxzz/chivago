import { strict as assert } from 'node:assert';
import { test, describe, beforeEach } from 'node:test';

import { MAX_PARTY_SIZE, summarise } from '@chivago/core';
import { openTestDb, type DB } from './db.ts';
import { applyMovement, ensureWallet, getBalances } from './wallet-service.ts';
import {
  PartyRefused, activePartyFor, createParty, disbandParty, generatePartyCode,
  joinParty, leaveParty, membersOf, normalisePartyCode,
} from './party-service.ts';

let db: DB;
const NOW = new Date('2026-09-02T00:00:00.000Z');
const later = (ms: number) => new Date(NOW.getTime() + ms);

const addUser = (id: string, name: string) => {
  db.prepare('INSERT INTO users (id, display_name, created_at) VALUES (?,?,?)')
    .run(id, name, NOW.toISOString());
  ensureWallet(db, id);
};

const verifiedQuest = (userId: string, questId: string, amount: number) =>
  applyMovement(db, {
    userId, label: questId, host: 'Samui Municipality', amount, currency: 'green',
    kind: 'quest_reward', sourceRef: `quest:${questId}:user:${userId}`,
  });

const openingBalance = (userId: string) =>
  applyMovement(db, {
    userId, label: 'Pilot opening balance', host: 'ChivaGo', amount: 1240,
    currency: 'green', kind: 'adjustment', sourceRef: `opening:green:${userId}`,
  });

beforeEach(() => {
  db = openTestDb();
  addUser('ana', 'Ana');
  addUser('bo', 'Bo');
  addUser('cara', 'Cara');
});

describe('a party aggregates, it never redistributes', () => {
  test('one member’s verified work does not appear in another’s figures', () => {
    // THE rule. Green means a named host checked it; the moment it arrives by
    // standing next to somebody who earned it, it means nothing.
    const { party } = createParty(db, 'ana', 'Songkran trip', NOW);
    const code = createParty(db, 'ana', 'Songkran trip', NOW).code;
    joinParty(db, 'bo', code, later(1000));

    verifiedQuest('ana', 'q1', 400);
    const members = membersOf(db, activePartyFor(db, 'ana')!.id, 'ana');

    assert.equal(members.find((m) => m.userId === 'ana')!.greenEarned, 400);
    assert.equal(members.find((m) => m.userId === 'bo')!.greenEarned, 0, 'Bo collected Ana’s work');
    assert.ok(party.id);
  });

  test('nobody’s wallet moves when a party is formed or joined', () => {
    verifiedQuest('ana', 'q1', 400);
    const before = getBalances(db, 'bo');
    const { code } = createParty(db, 'ana', 'Trip', NOW);
    joinParty(db, 'bo', code, later(1000));
    assert.deepEqual(getBalances(db, 'bo'), before, 'joining a party paid somebody');
  });

  test('the total is the sum, and it is the ONLY shared number', () => {
    const { code } = createParty(db, 'ana', 'Trip', NOW);
    joinParty(db, 'bo', code, later(1000));
    verifiedQuest('ana', 'q1', 400);
    verifiedQuest('bo', 'q2', 150);

    const s = summarise(membersOf(db, activePartyFor(db, 'ana')!.id, 'ana'));
    assert.equal(s.greenEarned, 550);
    assert.equal(s.missionsVerified, 2);
    assert.equal(s.kind, 'duo');
  });

  test('the pilot opening balance is not somebody’s contribution', () => {
    // Same bug the standing had. A party of four would otherwise open at
    // 4,960 "earned" before anybody had done anything at all.
    openingBalance('ana');
    openingBalance('bo');
    const { code } = createParty(db, 'ana', 'Trip', NOW);
    joinParty(db, 'bo', code, later(1000));

    const s = summarise(membersOf(db, activePartyFor(db, 'ana')!.id, 'ana'));
    assert.equal(s.greenEarned, 0, 'the opening grant became group achievement');
  });
});

describe('who is in it', () => {
  test('the founder is a member from the start', () => {
    createParty(db, 'ana', 'Trip', NOW);
    const p = activePartyFor(db, 'ana')!;
    assert.deepEqual(membersOf(db, p.id, 'ana').map((m) => m.userId), ['ana']);
  });

  test('the caller can tell which member is themselves', () => {
    const { code } = createParty(db, 'ana', 'Trip', NOW);
    joinParty(db, 'bo', code, later(1000));
    const p = activePartyFor(db, 'bo')!;
    assert.equal(membersOf(db, p.id, 'bo').find((m) => m.userId === 'bo')!.you, true);
    assert.equal(membersOf(db, p.id, 'bo').find((m) => m.userId === 'ana')!.you, false);
  });

  test('somebody is in at most one party at a time', () => {
    // Being silently in two makes "who am I travelling with" a question with
    // two answers.
    const first = createParty(db, 'ana', 'Trip one', NOW);
    const second = createParty(db, 'bo', 'Trip two', later(1000));
    joinParty(db, 'ana', second.code, later(2000));

    assert.equal(activePartyFor(db, 'ana')!.name, 'Trip two');
    assert.deepEqual(membersOf(db, first.party.id, 'ana').map((m) => m.userId), []);
  });

  test('a member who left stops counting towards the total', () => {
    const { code } = createParty(db, 'ana', 'Trip', NOW);
    joinParty(db, 'bo', code, later(1000));
    verifiedQuest('bo', 'q2', 150);
    verifiedQuest('ana', 'q1', 400);

    const p = activePartyFor(db, 'ana')!;
    assert.equal(summarise(membersOf(db, p.id, 'ana')).greenEarned, 550);
    leaveParty(db, 'bo', later(2000));
    assert.equal(summarise(membersOf(db, p.id, 'ana')).greenEarned, 400);
  });

  test('leaving is recorded, not erased', () => {
    // "Were they there when we did that" has to stay answerable.
    const { code } = createParty(db, 'ana', 'Trip', NOW);
    joinParty(db, 'bo', code, later(1000));
    leaveParty(db, 'bo', later(2000));
    const n = db.prepare('SELECT COUNT(*) c FROM party_members').get() as { c: number };
    assert.equal(n.c, 2, 'the membership row was deleted');
  });

  test('the party survives its founder leaving', () => {
    const { party, code } = createParty(db, 'ana', 'Trip', NOW);
    joinParty(db, 'bo', code, later(1000));
    leaveParty(db, 'ana', later(2000));

    assert.equal(activePartyFor(db, 'bo')!.id, party.id);
    assert.deepEqual(membersOf(db, party.id, 'bo').map((m) => m.userId), ['bo']);
  });
});

describe('joining by code', () => {
  test('a code nobody issued is refused as unknown', () => {
    assert.throws(
      () => joinParty(db, 'bo', 'ZZZZZZ', NOW),
      (e: unknown) => e instanceof PartyRefused && e.reason === 'unknown',
    );
  });

  test('lower case and stray spaces still work', () => {
    const { code } = createParty(db, 'ana', 'Trip', NOW);
    const messy = ` ${code.slice(0, 3).toLowerCase()}-${code.slice(3).toLowerCase()} `;
    assert.equal(normalisePartyCode(messy), code);
    assert.doesNotThrow(() => joinParty(db, 'bo', messy, later(1000)));
  });

  test('joining twice says so instead of pretending', () => {
    const { code } = createParty(db, 'ana', 'Trip', NOW);
    joinParty(db, 'bo', code, later(1000));
    assert.throws(
      () => joinParty(db, 'bo', code, later(2000)),
      (e: unknown) => e instanceof PartyRefused && e.reason === 'already-in',
    );
  });

  test('a full party is refused, counting only members who stayed', () => {
    const { code } = createParty(db, 'ana', 'Trip', NOW);
    for (let i = 1; i < MAX_PARTY_SIZE; i += 1) {
      addUser(`u${i}`, `Person ${i}`);
      joinParty(db, `u${i}`, code, later(i * 10));
    }
    assert.throws(
      () => joinParty(db, 'bo', code, later(9999)),
      (e: unknown) => e instanceof PartyRefused && e.reason === 'full',
    );

    // Somebody leaves, and the seat is free again. Counting departed members
    // forever would shrink the party over a fortnight.
    leaveParty(db, 'u1', later(10_000));
    assert.doesNotThrow(() => joinParty(db, 'bo', code, later(11_000)));
  });

  test('a disbanded party cannot be joined', () => {
    const { party, code } = createParty(db, 'ana', 'Trip', NOW);
    assert.equal(disbandParty(db, 'ana', party.id, later(1000)), true);
    assert.throws(
      () => joinParty(db, 'bo', code, later(2000)),
      (e: unknown) => e instanceof PartyRefused && e.reason === 'disbanded',
    );
    assert.equal(activePartyFor(db, 'ana'), null);
  });

  test('only the founder can disband it', () => {
    const { party, code } = createParty(db, 'ana', 'Trip', NOW);
    joinParty(db, 'bo', code, later(1000));
    assert.equal(disbandParty(db, 'bo', party.id, later(2000)), false);
    assert.equal(activePartyFor(db, 'bo')!.id, party.id);
  });

  test('rejoining after leaving works and does not duplicate the row', () => {
    const { code } = createParty(db, 'ana', 'Trip', NOW);
    joinParty(db, 'bo', code, later(1000));
    leaveParty(db, 'bo', later(2000));
    joinParty(db, 'bo', code, later(3000));

    const p = activePartyFor(db, 'bo')!;
    assert.deepEqual(membersOf(db, p.id, 'bo').map((m) => m.userId).sort(), ['ana', 'bo']);
    const n = db.prepare('SELECT COUNT(*) c FROM party_members WHERE user_id = ?').get('bo') as { c: number };
    assert.equal(n.c, 1);
  });
});

describe('the code itself', () => {
  test('it avoids characters that look like each other', () => {
    for (let i = 0; i < 200; i += 1) assert.doesNotMatch(generatePartyCode(), /[01OIL]/);
  });

  test('two parties never share a code', () => {
    const codes = new Set(Array.from({ length: 300 }, () => generatePartyCode()));
    assert.ok(codes.size > 290, `only ${codes.size} distinct codes in 300`);
  });

  test('the code is stored hashed, not in the clear', () => {
    const { code } = createParty(db, 'ana', 'Trip', NOW);
    const stored = db.prepare('SELECT code_hash FROM parties').all() as { code_hash: string }[];
    assert.notEqual(stored[0]!.code_hash, code);
    assert.match(stored[0]!.code_hash, /^[0-9a-f]{64}$/);
  });

  test('an unnamed party still has a name', () => {
    const { party } = createParty(db, 'ana', '   ', NOW);
    const stored = db.prepare('SELECT name FROM parties WHERE id = ?').get(party.id) as { name: string };
    assert.equal(stored.name, 'Our trip');
  });
});
