import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { STATIONS, RAILWAY_CATALOG } from '../shared/stations.ts';
import { searchStations } from '../src/lib/station-search.ts';
import type { StationData } from '../src/types.ts';

test('都営4路線の全106駅を99駅へまとめ、乗換・駅順・駅番号・よみ・所在地を保持する', () => {
  assert.equal(STATIONS.length, 99);
  assert.equal(new Set(STATIONS.map((station) => station.id)).size, 99);
  assert.equal(STATIONS.flatMap((station) => station.memberships!).length, 106);
  for (const [id, count] of [
    ['Asakusa', 20],
    ['Mita', 27],
    ['Shinjuku', 21],
    ['Oedo', 38],
  ] as const) {
    const line = RAILWAY_CATALOG.find((line) => line.id === id)!;
    assert.equal(new Set(line.stationIds).size, count);
    for (const stationId of new Set(line.stationIds)) {
      const station = STATIONS.find((station) => station.id === stationId)!;
      const member = station.memberships!.find((member) => member.railwayId === id)!;
      assert.match(member.code, new RegExp(`^${line.code}-\\d{2}$`));
      assert.ok(member.order.length && member.address && member.manager);
      assert.ok(Number.isFinite(member.latitude) && Number.isFinite(member.longitude));
      assert.ok(searchStations(station.reading!).matches.some((match) => match.id === stationId));
      assert.ok(searchStations(station.english).matches.some((match) => match.id === stationId));
    }
  }
  assert.deepEqual(
    STATIONS.find((station) => station.id === 'daimon')!.memberships!.map((m) => m.railwayId),
    ['Asakusa', 'Oedo'],
  );
  assert.equal(STATIONS.find((station) => station.id === 'motoyawata')!.area, '千葉県 市川市');
});

test('終端駅は公開された出発方向のみ、都庁前は3方面、新宿は2路線を収録する', () => {
  const load = (id: string): StationData =>
    JSON.parse(readFileSync(`public/data/${id}.json`, 'utf8'));
  for (const id of [
    'nishimagome',
    'oshiage',
    'meguro',
    'nishitakashimadaira',
    'motoyawata',
    'hikarigaoka',
  ])
    assert.equal(load(id).routes.length, 1, id);
  assert.equal(load('shinjuku').routes.length, 3);
  const tochomae = load('tochomae');
  assert.equal(tochomae.routes.length, 3);
  assert.deepEqual(
    tochomae.routes.map((route) => route.direction).sort(),
    ['光が丘', '新宿・六本木', '春日・両国'].sort(),
  );
  const all = STATIONS.map((station) => load(station.id));
  assert.equal(all.flatMap((station) => station.routes).length, 206);
  const tableIds = all.flatMap((station) =>
    station.routes.flatMap((route) => route.sourceTimetableIds!),
  );
  assert.equal(new Set(tableIds).size, 412);
  const coverage = JSON.parse(readFileSync('public/metadata/toei-coverage.json', 'utf8'));
  assert.equal(coverage.stationTimetableCount, tableIds.length);
  assert.equal(coverage.stationCount, STATIONS.length);
  assert.ok(
    coverage.sources.every((source: { sha256: string }) => /^[0-9a-f]{64}$/.test(source.sha256)),
  );
});
