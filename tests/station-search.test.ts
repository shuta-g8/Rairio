import test from 'node:test';
import assert from 'node:assert/strict';
import { searchStations } from '../src/lib/station-search.ts';
import { STATIONS } from '../shared/stations.ts';

test('全角・カタカナ・英語表記の揺れと駅の接尾辞を同じ検索結果にする', () => {
  for (const query of ['新橋', 'しんばし', 'シンバシ駅', 'SHIMBASHI', 'ＳＨＩＮＢＡＳＨＩ']) {
    assert.deepEqual(
      searchStations(query).matches.map((station) => station.id),
      ['shimbashi'],
    );
  }
  assert.deepEqual(
    searchStations('Sengakuji').matches.map((station) => station.id),
    ['sengakuji'],
  );
});

test('部分一致で複数駅を元の順に返し、該当しない駅では結果を空にする', () => {
  assert.deepEqual(
    searchStations('とごし').matches.map((station) => station.id),
    ['togoshi'],
  );
  assert.equal(searchStations('存在しない駅').matches.length, 0);
  assert.equal(searchStations('  ').term, '');
  assert.equal(searchStations('  ').matches.length, STATIONS.length);
});

test('全99駅の正式名は完全一致を先頭にし、馬込・浅草等を他駅の部分一致より優先する', () => {
  for (const station of STATIONS) {
    assert.equal(searchStations(station.name).matches[0]?.id, station.id, station.name);
  }
  for (const query of ['馬込', 'まごめ', 'マゴメ駅', 'Magome']) {
    assert.equal(searchStations(query).matches[0]?.id, 'magome');
    assert.ok(searchStations(query).matches.some((station) => station.id === 'nishimagome'));
  }
});
