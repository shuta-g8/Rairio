import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import type { JourneyData } from '../shared/journey.ts';
import {
  excludeClearDetours,
  journeyTransferCount,
  rankStationJourneys,
} from '../src/lib/journey-ranking.ts';
import { searchJourneys } from '../src/lib/journey.ts';
import { KANTO_NETWORK, networkPathsTo } from '../src/lib/kanto-network.ts';
import { guidanceConnections } from '../src/lib/journey-guidance.ts';

const data: JourneyData = JSON.parse(
  readFileSync(new URL('../public/journey/toei.json', import.meta.url), 'utf8'),
);
test('五反田〜新宿は山手線だけを案内し、遠回りの都営経由を除外する', () => {
  for (const start of [540, 720, 780]) {
    const detailed = searchJourneys(data, 'gotanda', 'shinjuku', '2026-11-17', start);
    const ranked = rankStationJourneys(data, detailed, 'gotanda', 'shinjuku');
    assert.equal(ranked[0].guidance?.segments?.length, 1);
    assert.equal(ranked[0].guidance?.segments?.[0].line, 'JR山手線');
    assert.equal(ranked[0].journey, undefined);
    assert.equal(ranked.length, 1);
    assert.ok(!ranked.some((r) => r.journey));
  }
});

test('比較できる都営案内は残し、明らかに劣る混在経路だけを除く', () => {
  const direct = rankStationJourneys(
    data,
    searchJourneys(data, 'gotanda', 'shinjuku', '2026-11-17', 540),
    'gotanda',
    'shinjuku',
  )[0];
  const detour = searchJourneys(data, 'gotanda', 'shinjuku', '2026-11-17', 540)[0];
  const removed = excludeClearDetours(data, [direct, { journey: detour }]);
  assert.deepEqual(removed, [direct]);
  const toShimbashi = searchJourneys(data, 'gotanda', 'shimbashi', '2026-11-17', 540)[0];
  const onward = guidanceConnections(`kanto:${KANTO_NETWORK.toei.shinjuku}`).find(
    (c) => c.station === 'shimbashi',
  )!;
  assert.deepEqual(
    excludeClearDetours(data, [
      direct,
      { journey: toShimbashi, guidance: onward, boundary: 'shimbashi' },
    ]),
    [direct],
  );
  const local = searchJourneys(data, 'shinjuku', 'shinjukusanchome', '2026-11-17', 540)[0];
  assert.equal(excludeClearDetours(data, [{ journey: local }])[0].journey, local);
});

test('乗換回数は都営・他社線・境界駅の乗換を合算する', () => {
  const direct = rankStationJourneys(
    data,
    searchJourneys(data, 'gotanda', 'shinjuku', '2026-11-17', 540),
    'gotanda',
    'shinjuku',
  )[0];
  assert.equal(journeyTransferCount(direct), 0);
  const known = searchJourneys(data, 'togoshi', 'kachidoki', '2026-11-17', 540)[0];
  assert.equal(journeyTransferCount({ journey: known }), 1);
  const water = KANTO_NETWORK.stations.find((s) => s.name === '水戸')!;
  const guidance = guidanceConnections(`kanto:${water.id}`).find((c) => c.station === 'shimbashi')!;
  const journey = searchJourneys(data, 'gotanda', 'shimbashi', '2026-11-17', 540)[0];
  assert.ok(guidance.segments!.length > 1);
  assert.equal(journeyTransferCount({ journey, guidance }), guidance.segments!.length);
  assert.equal(journeyTransferCount({ guidance }), guidance.segments!.length - 1);
});
test('都営で直接移動できる短区間を未確認の他社経路で置き換えない', () => {
  const detailed = searchJourneys(data, 'shinjuku', 'shinjukusanchome', '2026-11-17', 720);
  assert.equal(
    rankStationJourneys(data, detailed, 'shinjuku', 'shinjukusanchome')[0].journey,
    detailed[0],
  );
  assert.ok(
    rankStationJourneys(
      data,
      searchJourneys(data, 'togoshi', 'kachidoki', '2026-11-17', 720),
      'togoshi',
      'kachidoki',
    ).every((r) => r.journey),
  );
});
test('山手線の距離比較は既知の駅順の短い側を使う', () => {
  const path = networkPathsTo(KANTO_NETWORK.toei.shinjuku).get(KANTO_NETWORK.toei.gotanda)!;
  assert.equal(path.segments.length, 1);
  assert.equal(path.segments[0].lineId, '11302');
  assert.ok(path.distance > 5 && path.distance < 10);
});
