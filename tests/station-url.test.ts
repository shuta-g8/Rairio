import test from 'node:test';
import assert from 'node:assert/strict';
import { STATIONS } from '../shared/stations.ts';
import { stationFromSearch, stationUrl } from '../src/lib/station-url.ts';

test('URLの駅指定は都営の全駅を受け付け、不明な値では保存済み駅へ戻せる', () => {
  for (const station of STATIONS) {
    assert.equal(stationFromSearch(`?from=shared&station=${station.id}`), station.id);
  }
  for (const search of [
    '',
    '?station=',
    '?station=unknown',
    '?station=constructor',
    '?station=%FF',
  ]) {
    assert.equal(stationFromSearch(search), undefined);
  }
});

test('駅URLはサブパスと他のパラメータを保ち、旧発車案内ハッシュを除く', () => {
  assert.equal(
    stationUrl('daimon', 'https://example.test/app/?source=a%26b&station=gotanda#departures'),
    '/app/?source=a%26b&station=daimon',
  );
  assert.equal(
    stationUrl('daimon', 'https://example.test/?station=gotanda&station=daimon'),
    '/?station=daimon',
  );
  assert.equal(
    stationUrl('gotanda', 'https://example.test/?from=shared#other-section'),
    '/?from=shared&station=gotanda#other-section',
  );
});
