import { strict as assert } from 'node:assert';
import { describe, test } from 'node:test';
import {
  KOH_SICHANG_WMO, TMD_OBSERVATION_MAX_AGE_MS, parseTmdTime, readKohSichangObservation,
  readTmdWarnings, tmdObservationUrl, tmdWarningUrl,
} from './tmd-weather.ts';

const NOW = Date.parse('2026-10-24T22:45:00+07:00');

describe('TMD weather adapters', () => {
  test('reads only the real Ko Sichang station and converts km/h to knots', () => {
    const reading = readKohSichangObservation({
      Stations: { Station: [
        { WmoStationNumber: '48300', Observation: { DateTime: '10/24/2026 22:00:00', AirTemperature: '99' } },
        {
          WmoStationNumber: KOH_SICHANG_WMO,
          StationNameThai: 'เกาะสีชัง',
          Observation: {
            DateTime: '10/24/2026 22:00:00', AirTemperature: '27.8', Rainfall: '1.2',
            WindSpeed: '18.52', WindDirection: '225', RelativeHumidity: '81',
          },
        },
      ] },
    }, NOW);
    assert.ok(reading);
    assert.equal(reading.kind, 'observation');
    assert.equal(reading.tempC, 27.8);
    assert.equal(reading.windKn, 10);
    assert.equal(reading.windDirectionDeg, 225);
    assert.equal(reading.relativeHumidityPct, 81);
    assert.equal(reading.observedAt, Date.parse('2026-10-24T22:00:00+07:00'));
  });

  test('rejects a missing, future, or stuck station instead of silently using it', () => {
    const payload = (stamp: string, wmo = KOH_SICHANG_WMO) => ({ Stations: { Station: [{
      WmoStationNumber: wmo, Observation: { DateTime: stamp, AirTemperature: '27' },
    }] } });
    assert.equal(readKohSichangObservation(payload('10/24/2026 23:30:00'), NOW), null);
    assert.equal(readKohSichangObservation(payload('10/23/2026 12:00:00'), NOW), null);
    assert.equal(readKohSichangObservation(payload('10/24/2026 22:00:00', '99999'), NOW), null);
  });

  test('a reading older than the station reporting slot plus an hour is not used for now', () => {
    const at = (offsetMs: number) => {
      const d = new Date(NOW - offsetMs + 7 * 3_600_000);
      const p2 = (n: number) => String(n).padStart(2, '0');
      return `${p2(d.getUTCMonth() + 1)}/${p2(d.getUTCDate())}/${d.getUTCFullYear()} ${p2(d.getUTCHours())}:${p2(d.getUTCMinutes())}:00`;
    };
    const payload = (stamp: string) => ({ Stations: { Station: [{
      WmoStationNumber: KOH_SICHANG_WMO, Observation: { DateTime: stamp, AirTemperature: '27' },
    }] } });
    assert.ok(readKohSichangObservation(payload(at(TMD_OBSERVATION_MAX_AGE_MS)), NOW));
    assert.equal(readKohSichangObservation(payload(at(TMD_OBSERVATION_MAX_AGE_MS + 60_000)), NOW), null);
  });

  test('every TMD stamp is read on the Thai clock, whatever clock the server keeps', () => {
    const ict = Date.parse('2026-10-24T22:00:00+07:00');
    assert.equal(parseTmdTime('10/24/2026 22:00:00'), ict);
    assert.equal(parseTmdTime('2026-10-24T22:00:00'), ict, 'a bare ISO stamp is ICT, not the server clock');
    assert.equal(parseTmdTime('2026-10-24T22:00'), ict);
    assert.equal(parseTmdTime('2026-10-24T15:00:00Z'), ict, 'a stamp with its own offset keeps it');
    assert.equal(parseTmdTime('not a time'), null);
  });

  test('keeps official warning text, deduplicates it, and refuses non-TMD links', () => {
    const warning = {
      IssueNo: '8', TitleThai: 'คลื่นลมแรงบริเวณอ่าวไทย', HeadlineThai: 'ขอให้เดินเรือด้วยความระมัดระวัง',
      AnnounceDate: '10/24/2026 16:00:00', WebUrlThai: 'https://www.tmd.go.th/warning/8',
    };
    const alerts = readTmdWarnings({ WarningNews: [warning, warning, {
      ...warning, IssueNo: '9', WebUrlThai: 'https://example.com/not-official',
    }] });
    assert.equal(alerts.length, 2);
    assert.equal(alerts[0]?.source, 'TMD');
    assert.equal(alerts[0]?.url, 'https://www.tmd.go.th/warning/8');
    assert.equal(alerts[1]?.url, null);
  });

  test('credentials are encoded and never required by a public client', () => {
    const config = { uid: 'name+test', apiKey: 'key&secret' };
    assert.match(tmdObservationUrl(config)!, /uid=name%2Btest/);
    assert.match(tmdWarningUrl(config)!, /ukey=key%26secret/);
    assert.equal(tmdObservationUrl({}), null);
    assert.equal(tmdWarningUrl({ uid: 'only-a-user' }), null);
  });
});
