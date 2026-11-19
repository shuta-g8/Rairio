import test from 'node:test';
import assert from 'node:assert/strict';
import type { RankedJourney } from '../src/lib/journey-ranking.ts';
import { completeJourneyArrival, sortJourneyOptions } from '../src/lib/journey-sort.ts';

const known = (arrival: number): RankedJourney => ({
  journey: { serviceDate: '2026-11-17', departure: 540, arrival, legs: [] },
});
const external: RankedJourney = {
  guidance: { station: 'shimbashi', line: 'JR山手線', from: '新橋', to: '東京' },
};

test('全区間の到着時刻で整列し、他社線の未計算候補や元の配列を維持する', () => {
  const later = known(600),
    earlier = known(580);
  const mixed = { ...known(550), ...external };
  const input = [external, later, mixed, earlier];
  assert.equal(completeJourneyArrival(mixed), undefined);
  assert.deepEqual(sortJourneyOptions(input, 'arrival'), [earlier, later, external, mixed]);
  assert.deepEqual(input, [external, later, mixed, earlier]);
});

test('都営線優先は都営のみ・混在・他社のみの順で、未知の到着時刻を比較しない', () => {
  const later = known(600),
    earlier = known(580);
  const mixed = { ...known(550), ...external };
  assert.deepEqual(sortJourneyOptions([external, mixed, later, earlier], 'toei'), [
    earlier,
    later,
    mixed,
    external,
  ]);
});

test('他社線から始まる経路には都営区間の時刻を全区間の到着順として使わない', () => {
  const a = known(600),
    b = known(580);
  assert.equal(completeJourneyArrival(a, true), undefined);
  assert.deepEqual(sortJourneyOptions([a, b], 'arrival', true), [a, b]);
});
