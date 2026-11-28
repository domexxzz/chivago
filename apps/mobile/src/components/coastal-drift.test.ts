import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { URL, fileURLToPath } from 'node:url';
import {
  coastalDriftExpired, coastalDriftPoints, coastalDriftStaleHours, coastalSide, parseCoastalDrift,
} from './coastal-drift.ts';

const fixture = JSON.parse(readFileSync(
  fileURLToPath(new URL('../../public/islands/koh-sichang.drift.json', import.meta.url)),
  'utf8',
)) as unknown;

test('the published Ko Sichang run becomes ranked, clickable shoreline points', () => {
  const file = parseCoastalDrift(fixture);
  assert.ok(file);
  assert.equal(file.segments.length, 43);
  assert.equal(file.calibrated, false);

  const points = coastalDriftPoints(file);
  assert.equal(points.length, 22);
  assert.equal(points[0]?.id, 24);
  assert.equal(points[0]?.count, 83);
  assert.equal(points[0]?.rank, 1);
  assert.equal(points[0]?.attention, 'higher');
  assert.deepEqual(points[0]?.locationLabel, {
    en: 'Tha Wang Beach', th: 'หาดท่าวัง', zh: '塔旺海滩',
  });
  assert.ok(points.every((point, index) => index === 0 || points[index - 1]!.count >= point.count));
  assert.ok(points.every((point) => point.lat >= 13.08 && point.lat <= 13.22));
  assert.ok(points.every((point) => point.lng >= 100.75 && point.lng <= 100.86));
});
test('Thai-only source names become labels in every supported app language', () => {
  const points = coastalDriftPoints(parseCoastalDrift(fixture));
  const thamPhang = points.find((point) => point.near === 'หาดถ้ำพัง');
  assert.deepEqual(thamPhang?.locationLabel, {
    en: 'Tham Phang Beach', th: 'หาดถ้ำพัง', zh: '探蓬海滩',
  });
  assert.equal(/[ก-๙]/u.test(thamPhang?.locationLabel.en ?? ''), false);
  assert.equal(/[ก-๙]/u.test(thamPhang?.locationLabel.zh ?? ''), false);
});

test('shore sides come from the published 43-segment ordering', () => {
  assert.equal(coastalSide(1), 'west');
  assert.equal(coastalSide(8), 'north');
  assert.equal(coastalSide(15), 'east');
  assert.equal(coastalSide(27), 'south');
  assert.equal(coastalSide(40), 'west');
});

test('invalid or calibrated data never reaches the map as a forecast', () => {
  assert.equal(parseCoastalDrift({}), null);
  assert.equal(parseCoastalDrift({ ...(fixture as Record<string, unknown>), calibrated: true }), null);
  const bad = structuredClone(fixture) as { segments: Array<{ path: [number, number][] }> };
  bad.segments[0]!.path[0] = [0, 0];
  assert.equal(parseCoastalDrift(bad), null);
});

/*
  THE RUN THAT WAS ELEVEN DAYS PAST A SIX-HOUR WINDOW. It sat behind a tab
  labelled "พยากรณ์ขยะลอย" on the live site and nothing failed, because a
  stale file parses exactly as well as a fresh one. `issued` was printed as a
  date and never compared against the clock.
*/
test('a run is expired once it outlives the window it forecasts', () => {
  const file = parseCoastalDrift(fixture);
  assert.ok(file);
  const issued = Date.parse(file.issued!);
  const hour = 3_600_000;

  // Inside the window it stands.
  assert.equal(coastalDriftExpired(file, issued), false);
  assert.equal(coastalDriftExpired(file, issued + file.window * hour - 1), false);
  assert.equal(coastalDriftStaleHours(file, issued + hour), null);

  // Past it, it is a different sea.
  assert.equal(coastalDriftExpired(file, issued + file.window * hour + 1), true);
  assert.equal(coastalDriftStaleHours(file, issued + (file.window + 5) * hour), 5);

  // The real published run, against the day it was found on the live site.
  const found = Date.parse('2026-11-28T12:00+07:00');
  assert.equal(coastalDriftExpired(file, found), true);
  assert.ok(coastalDriftStaleHours(file, found)! > 24 * 10,
    'the run found on production was more than ten days past its window');
});

test('a run that will not say when it was computed is expired', () => {
  const file = parseCoastalDrift(fixture);
  assert.ok(file);
  // `parseCoastalDrift` does not require `issued`, so the absence is answered
  // here or nowhere.
  assert.equal(coastalDriftExpired({ ...file, issued: null }, Date.now()), true);
  assert.equal(coastalDriftExpired({ ...file, issued: 'last Tuesday' }, Date.now()), true);
  assert.equal(coastalDriftStaleHours({ ...file, issued: null }), null);
  assert.equal(coastalDriftExpired(null), true);
});

test('a run issued in the future is not trusted either', () => {
  const file = parseCoastalDrift(fixture);
  assert.ok(file);
  const issued = Date.parse(file.issued!);
  assert.equal(coastalDriftExpired(file, issued - 1), true);
  assert.equal(coastalDriftStaleHours(file, issued - 3_600_000), null);
});
