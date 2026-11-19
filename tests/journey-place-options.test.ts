import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultJourneyPlace, journeyPlaceOptions } from '../src/lib/journey-place-options.ts';

test('出発駅の取得済み現在地・再取得・履歴を一意な候補順にする', () => {
  const recent = ['togoshi', 'daimon'];
  const options = journeyPlaceOptions('', recent, { stationId: 'togoshi' });
  assert.deepEqual(
    options.map((option) => option.kind),
    ['nearby', 'refresh', 'station'],
  );
  assert.deepEqual(
    options.flatMap((option) => ('place' in option ? [option.place.id] : [])),
    ['togoshi', 'daimon'],
  );
  assert.deepEqual(recent, ['togoshi', 'daimon']);
});

test('未取得の現在地と到着駅の履歴を区別し、不正な保存駅を除外する', () => {
  assert.deepEqual(
    journeyPlaceOptions('', [], {}).map((option) => option.kind),
    ['locate'],
  );
  const destination = journeyPlaceOptions('', ['unknown', 'togoshi']);
  assert.deepEqual(
    destination.map((option) => option.kind),
    ['station'],
  );
  assert.equal(defaultJourneyPlace('', destination)?.id, 'togoshi');
});

test('駅名入力中は現在地操作を混ぜず、完全一致の駅を確定する', () => {
  const options = journeyPlaceOptions('新宿', ['togoshi'], { stationId: 'togoshi' });
  assert.ok(options.every((option) => option.kind === 'station'));
  assert.equal(defaultJourneyPlace('新宿', options)?.id, 'shinjuku');
  assert.equal(journeyPlaceOptions('存在しない駅', [], {}).length, 0);
});
