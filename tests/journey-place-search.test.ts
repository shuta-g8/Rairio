import test from 'node:test';
import assert from 'node:assert/strict';
import {
  searchJourneyPlaces,
  exactJourneyPlace,
  journeyPlaceName,
  placeName,
} from '../src/lib/journey-place-search.ts';

test('新宿は完全一致の新宿駅を最優先し、接続路線名から東日本橋を混ぜない', () => {
  const matches = searchJourneyPlaces('新宿');
  assert.equal(matches[0].id, 'shinjuku');
  assert.ok(!matches.some((p) => p.id === 'higashinihombashi'));
  assert.equal(exactJourneyPlace('新宿')?.id, 'shinjuku');
});

test('駅名・かな・英語で駅だけを検索し、路線名は候補に出さない', () => {
  for (const query of ['しんじゅく', 'シンジュク', 'Shinjuku'])
    assert.ok(searchJourneyPlaces(query).some((p) => p.id === 'shinjuku'));
  assert.deepEqual(searchJourneyPlaces('東急池上線'), []);
  assert.deepEqual(searchJourneyPlaces('山手線'), []);
  assert.ok(searchJourneyPlaces('東京（東京都）').some((p) => p.id === 'kanto:1130101'));
  assert.equal(exactJourneyPlace('東急池上線'), undefined);
  assert.equal(searchJourneyPlaces('').length, 0);
});

test('県名は表示名から外し、検索・駅の識別情報と駅名自体の括弧は保持する', () => {
  const tokyo = exactJourneyPlace('東京（東京都）')!;
  assert.equal(placeName(tokyo.id), '東京');
  assert.equal(journeyPlaceName('横浜（神奈川県）'), '横浜');
  assert.equal(journeyPlaceName('駅名（支線）'), '駅名（支線）');
  assert.equal(exactJourneyPlace('東京')?.id, tokyo.id);
  assert.equal(placeName('unknown'), '');
});
