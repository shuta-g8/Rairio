import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { TIMETABLE_SOURCE, TOEI_OPERATOR, DATA_LICENSE } from '../shared/transit-source.ts';
import { lineName } from '../src/lib/stations.ts';
import { STATIONS, RAILWAY_CATALOG } from '../shared/stations.ts';
import { nextDepartures } from '../src/lib/time.ts';
import type { StationData } from '../src/types.ts';
import { reviewedStation } from './helpers/reviewed-station.ts';
import { JOURNEY_GTFS_CATALOG } from '../shared/journey-sources.ts';
import fs from 'node:fs';
import {
  validateTimetableManifest,
  releaseForDate,
  editionServiceDate,
  ASAKUSA_CUTOVER,
  verifyEditionAsset,
} from '../shared/timetable-editions.ts';
const timetableManifest = validateTimetableManifest(
  JSON.parse(fs.readFileSync('shared/asakusa-timetable-manifest.json', 'utf8')),
);
const coverage = JSON.parse(fs.readFileSync('public/metadata/toei-coverage.json', 'utf8'));
const distributedRelease = timetableManifest.releases.find(
  (release) => release.id === coverage.asakusaTimetableEdition.active,
);

for (const station of STATIONS)
  test(`${station.name}: 全路線・各方面・3種類のダイヤに実時刻がある`, async () => {
    const data: StationData = await reviewedStation(station.id);
    assert.equal(data.name, station.name);
    assert.equal(data.sourceUrl, TIMETABLE_SOURCE);
    assert.equal(data.sourceId, TOEI_OPERATOR);
    assert.equal(data.sourceLicense, DATA_LICENSE);
    assert.ok(Number.isFinite(Date.parse(data.sourceUpdated!)));
    assert.deepEqual(
      [...new Set(data.routes.map((r) => lineName(r.line)))].sort(),
      station
        .memberships!.map(
          (membership) => RAILWAY_CATALOG.find((line) => line.id === membership.railwayId)!.name,
        )
        .sort(),
    );
    assert.equal(new Set(data.routes.map((r) => r.id)).size, data.routes.length);
    assert.deepEqual(
      data.routes.flatMap((route) => route.sourceTimetableIds ?? []).sort(),
      station
        .memberships!.filter(
          (member) => member.railwayId !== 'Asakusa' || !distributedRelease?.gtfs,
        )
        .flatMap((member) => member.timetableIds)
        .sort(),
    );
    const ref = distributedRelease?.stations[station.id];
    const verified =
      ref && distributedRelease
        ? await verifyEditionAsset(
            fs.readFileSync('public/' + ref.path, 'utf8'),
            timetableManifest,
            distributedRelease,
            station.id,
          )
        : [];
    for (const route of data.routes) {
      const gtfs = route.railwayId === 'Asakusa' && !!distributedRelease?.gtfs;
      if (gtfs) {
        assert.equal(route.sourceUrl, JOURNEY_GTFS_CATALOG);
        assert.deepEqual(route.schedules, verified.find((r) => r.id === route.id)?.schedules);
      }
      assert.match(route.color, /^#[0-9a-f]{6}$/i);
      if (route.timetableUnavailable) {
        assert.equal(route.railwayId, 'Asakusa');
        assert.ok(editionServiceDate(Date.now()) >= ASAKUSA_CUTOVER);
        assert.equal(releaseForDate(timetableManifest, editionServiceDate(Date.now())), null);
      }
      for (const schedule of Object.values(route.schedules)) {
        if (route.timetableUnavailable) assert.equal(schedule.length, 0);
        else assert.ok(schedule.length > 0);
        for (const train of schedule) {
          assert.match(train.time, /^([01]\d|2[0-3]):[0-5]\d$/);
          assert.ok(train.destination);
          if (gtfs) {
            assert.equal(train.type, '');
            assert.ok(train.gtfs && train.gtfs.stopMask > 0);
          } else assert.ok(train.type);
        }
      }
      for (const time of [
        '2026-10-23T12:00:00+09:00',
        '2026-10-24T00:05:00+09:00',
        '2026-11-03T02:00:00+09:00',
      ]) {
        const now = new Date(time);
        const departures = nextDepartures(route, now);
        assert.equal(departures.length, 2);
        assert.ok(departures[0].timestamp >= now.getTime());
        assert.ok(departures[1].timestamp >= departures[0].timestamp);
      }
    }
  });

test('配信用JSONは都営版の対象駅だけを収録し、他社線の旧ファイルを含めない', () => {
  assert.deepEqual(
    readdirSync('public/data')
      .filter((f) => f.endsWith('.json'))
      .sort(),
    STATIONS.map((s) => `${s.id}.json`).sort(),
  );
});
