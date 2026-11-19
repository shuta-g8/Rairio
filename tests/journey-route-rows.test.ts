import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import type { JourneyData } from '../shared/journey.ts';
import { searchJourneys } from '../src/lib/journey.ts';
import { buildJourneyRouteRows } from '../src/lib/journey-route-rows.ts';

const data: JourneyData = JSON.parse(
  readFileSync(new URL('../public/journey/toei.json', import.meta.url), 'utf8'),
);

test('徒歩で乗り換える同駅は両側の駅番号・発着時刻を分け、元の経路を変更しない', () => {
  const journey = searchJourneys(data, 'togoshi', 'kachidoki', '2026-11-17', 540)[0];
  const original = structuredClone(journey);
  const rows = buildJourneyRouteRows(journey, data);
  const stations = rows.filter((row) => row.kind === 'station');
  const daimon = stations.filter((row) => row.id === 'daimon');
  assert.equal(stations[0].id, 'togoshi');
  assert.equal(stations.at(-1)?.id, 'kachidoki');
  assert.equal(daimon.length, 2);
  assert.deepEqual(
    daimon.map((row) => row.lines),
    [['Asakusa'], ['Oedo']],
  );
  assert.equal(daimon[0].arrival, journey.legs[0].arrival);
  assert.equal(daimon[0].departure, undefined);
  assert.equal(daimon[1].arrival, undefined);
  assert.equal(daimon[1].departure, journey.legs[2].departure);
  assert.deepEqual(journey, original);
});

test('徒歩のない同駅での列車変更は1駅行に着・発と待ち時間をまとめる', () => {
  const journeys = searchJourneys(data, 'togoshi', 'kachidoki', '2026-11-17', 540);
  const journey = journeys.find((j) =>
    buildJourneyRouteRows(j, data).some(
      (row) => row.kind === 'station' && row.waitMinutes !== undefined,
    ),
  )!;
  assert.ok(journey);
  const rows = buildJourneyRouteRows(journey, data);
  const transfer = rows.find((row) => row.kind === 'station' && row.waitMinutes !== undefined);
  assert.ok(transfer?.kind === 'station');
  assert.equal(rows.filter((row) => row.kind === 'station' && row.id === transfer.id).length, 1);
  assert.equal(transfer.waitMinutes, transfer.departure! - transfer.arrival!);
  assert.deepEqual(transfer.lines, ['Asakusa']);
});

test('徒歩だけの異名駅間連絡は両駅を区別し、列車の時刻・路線を付けない', () => {
  const journey = searchJourneys(data, 'higashinihombashi', 'bakuroyokoyama', '2026-11-17', 540)[0];
  const rows = buildJourneyRouteRows(journey, data);
  const stations = rows.filter((row) => row.kind === 'station');
  assert.deepEqual(
    stations.map((row) => row.id),
    ['higashinihombashi', 'bakuroyokoyama'],
  );
  assert.equal(rows.length, 3);
  for (const station of stations) {
    assert.deepEqual(station.lines, []);
    assert.equal(station.arrival, undefined);
    assert.equal(station.departure, undefined);
  }
});
