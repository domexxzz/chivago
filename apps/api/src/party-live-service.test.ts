import { strict as assert } from 'node:assert';
import { beforeEach, describe, test } from 'node:test';
import { openTestDb, type DB } from './db-node.ts';
import { createParty, joinParty } from './party-service.ts';
import {
  PartyLiveError, addItineraryPlace, addPartyMessage, finishPartyTrip, itinerary, liveMembers,
  meetingPoint, partyMessages, setLocationSharing, setMeetingPoint, tripSummary, updatePartyLocation,
} from './party-live-service.ts';

let db: DB;
const NOW = new Date('2026-11-17T05:00:00.000Z');
const addUser = (id: string, name: string) => db.prepare('INSERT INTO users(id,display_name,created_at) VALUES(?,?,?)').run(id, name, NOW.toISOString());
const addPlace = () => db.prepare(`INSERT INTO places(id,name_en,name_th,short,layer,lat,lng,meta,blurb_en,blurb_th,tags,safety_label_en,safety_label_th,crowd_density,aqi,safety_index,walkability)
  VALUES('pier','Tha Lang pier','ท่าเรือท่าล่าง','Pier','Services',13.16,100.80,'Pier','Pier','ท่าเรือ','[]','Normal','ปกติ',1,20,8,8)`).run();

beforeEach(() => {
  db = openTestDb(); addUser('owner', 'Owner'); addUser('friend', 'Friend'); addUser('outsider', 'Outsider'); addPlace();
});

const joined = () => {
  const made = createParty(db, 'owner', 'Island day', NOW);
  joinParty(db, 'friend', made.code, new Date(NOW.getTime() + 1_000));
  return made.party.id;
};

describe('party location privacy', () => {
  test('sharing must be explicit and disabling it deletes the latest precise fix', () => {
    const partyId = joined();
    assert.throws(() => updatePartyLocation(db, 'friend', { latitude: 13.16, longitude: 100.8 }, NOW), (error: unknown) => error instanceof PartyLiveError && error.code === 'SHARING_DISABLED');
    setLocationSharing(db, 'friend', true, NOW);
    updatePartyLocation(db, 'friend', { latitude: 13.16, longitude: 100.8, accuracy: 8 }, new Date(NOW.getTime() + 2_000));
    const visible = liveMembers(db, 'owner', new Date(NOW.getTime() + 2_500)).find((member) => member.userId === 'friend')!;
    assert.equal(visible.latitude, 13.16);
    assert.equal(visible.presence, 'online');
    setLocationSharing(db, 'friend', false, new Date(NOW.getTime() + 3_000));
    assert.equal(liveMembers(db, 'owner').find((member) => member.userId === 'friend')!.latitude, null);
    assert.equal((db.prepare('SELECT COUNT(*) AS n FROM party_locations WHERE party_id=?').get(partyId) as { n: number }).n, 0);
  });

  test('a user outside the party cannot read live members', () => {
    joined();
    assert.throws(() => liveMembers(db, 'outsider'), (error: unknown) => error instanceof PartyLiveError && error.code === 'NO_PARTY');
  });
});

describe('party collaboration', () => {
  test('members share one meeting point', () => {
    joined();
    setMeetingPoint(db, 'friend', { latitude: 13.16, longitude: 100.8, label: 'Pier gate' }, NOW);
    assert.equal(meetingPoint(db, 'owner')?.label, 'Pier gate');
  });

  test('chat and quick pings retain their kind and verified place reference', () => {
    joined();
    addPartyMessage(db, 'owner', { body: 'ถึงแล้ว', kind: 'chat' }, NOW);
    addPartyMessage(db, 'friend', { body: 'ดูตรงนี้', kind: 'ping', pingKind: 'look_here', placeId: 'pier' }, new Date(NOW.getTime() + 1_000));
    const messages = partyMessages(db, 'owner');
    assert.equal(messages.length, 2);
    assert.equal(messages[0]?.kind, 'ping');
    assert.equal(messages[0]?.placeId, 'pier');
    assert.equal(messages[1]?.body, 'ถึงแล้ว');
  });

  test('the shared itinerary uses real place records and produces a summary without GPS history', () => {
    const partyId = joined();
    addItineraryPlace(db, 'friend', 'pier', NOW);
    assert.deepEqual(itinerary(db, 'owner').map((item) => item.placeId), ['pier']);
    setLocationSharing(db, 'owner', true, NOW);
    updatePartyLocation(db, 'owner', { latitude: 13.16, longitude: 100.8 }, new Date(NOW.getTime() + 2_000));
    const summary = finishPartyTrip(db, 'owner', new Date(NOW.getTime() + 60_000));
    assert.equal(summary.memberCount, 2);
    assert.deepEqual(summary.itinerary.map((item) => item.placeId), ['pier']);
    assert.equal((db.prepare('SELECT COUNT(*) AS n FROM party_locations WHERE party_id=?').get(partyId) as { n: number }).n, 0);
    assert.deepEqual(tripSummary(db, 'friend', partyId), summary);
    assert.equal(db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='party_location_history'").get(), undefined);
  });
});
