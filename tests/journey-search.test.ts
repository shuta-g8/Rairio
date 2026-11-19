import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import type { JourneyData } from '../shared/journey.ts';
import { searchJourneyOptions } from '../src/lib/journey-search.ts';
import { searchJourneys } from '../src/lib/journey.ts';
import { exactJourneyPlace } from '../src/lib/journey-place-search.ts';
import { KANTO_NETWORK } from '../src/lib/kanto-network.ts';

const data: JourneyData = JSON.parse(
  readFileSync(new URL('../public/journey/toei.json', import.meta.url), 'utf8'),
);
const conditions = { date: '2026-11-17', time: '09:00' };

test('検索全体を通して都営の列車・運賃・駅名を維持する', () => {
  const result = searchJourneyOptions(data, { ...conditions, from: 'togoshi', to: 'kachidoki' });
  assert.equal(result.from, '戸越');
  assert.equal(result.to, '勝どき');
  assert.equal(result.external, false);
  assert.equal(result.message, undefined);
  assert.deepEqual(
    result.results.map((r) => r.journey),
    searchJourneys(data, 'togoshi', 'kachidoki', conditions.date, 540),
  );
});

test('都営・関東カタログのどちらで新宿を選んでも五反田からの遠回りを除く', () => {
  for (const to of ['shinjuku', `kanto:${KANTO_NETWORK.toei.shinjuku}`]) {
    const result = searchJourneyOptions(data, { ...conditions, from: 'gotanda', to });
    assert.equal(result.results.length, 1);
    assert.equal(result.results[0].journey, undefined);
    assert.equal(result.results[0].guidance?.segments?.[0].line, 'JR山手線');
    assert.equal(result.external, true);
  }
});

test('他社線との混在候補は往復とも都営との境界駅で連続する', () => {
  const tokyo = exactJourneyPlace('東京')!.id;
  for (const inbound of [false, true]) {
    const result = searchJourneyOptions(data, {
      ...conditions,
      from: inbound ? tokyo : 'gotanda',
      to: inbound ? 'gotanda' : tokyo,
    });
    assert.equal(result.inbound, inbound);
    assert.equal(result.external, true);
    assert.equal(result.results[0].journey, undefined);
    assert.ok(result.results.some((r) => r.journey && r.guidance));
    for (const candidate of result.results) {
      const segments = candidate.guidance!.segments!;
      const boundaryId = inbound ? segments.at(-1)!.toId : segments[0].fromId;
      assert.equal(boundaryId, KANTO_NETWORK.toei[candidate.boundary!]);
      if (candidate.journey) {
        const legs = candidate.journey.legs;
        const stop = inbound ? legs[0].from : legs.at(-1)!.to;
        assert.equal(data.stops[stop].station, candidate.boundary);
      }
    }
  }
});

test('同一駅グループや未収録日は候補を作らず理由を返す', () => {
  for (const input of [
    { ...conditions, from: 'gotanda', to: `kanto:${KANTO_NETWORK.toei.gotanda}` },
    {
      ...conditions,
      from: `kanto:${KANTO_NETWORK.toei.gotanda}:${encodeURIComponent('五反田')}`,
      to: 'gotanda',
    },
  ]) {
    const result = searchJourneyOptions(data, input);
    assert.deepEqual(result.results, []);
    assert.match(result.message!, /同じ駅・乗換駅グループ/);
  }
  const missing = searchJourneyOptions(data, {
    ...conditions,
    date: '2030-01-01',
    from: 'togoshi',
    to: 'kachidoki',
  });
  assert.deepEqual(missing.results, []);
  assert.match(missing.message!, /未収録/);
});

test('改正後の浅草線を含む未接続の検索は架空の時刻を返さない', () => {
  const result = searchJourneyOptions(data, {
    ...conditions,
    date: '2026-11-21',
    from: 'togoshi',
    to: 'kachidoki',
  });
  assert.deepEqual(result.results, []);
  assert.match(result.message!, /候補が見つかりませんでした/);
});
