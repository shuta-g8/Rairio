import test from 'node:test';
import assert from 'node:assert/strict';
import {
  addSavedStation,
  loadSavedStations,
  storeSavedStations,
  validSavedStations,
  SAVED_STATIONS_KEY,
} from '../src/lib/saved-stations.ts';

test('登録駅は有効な駅だけを登録順で5件保持し、重複や6件目で既存駅を置き換えない', () => {
  const ids = validSavedStations([
    'gotanda',
    'unknown',
    'daimon',
    'gotanda',
    5,
    'asakusa',
    'shinjuku',
    'hikarigaoka',
    'otemachi',
  ]);
  assert.deepEqual(ids, ['gotanda', 'daimon', 'asakusa', 'shinjuku', 'hikarigaoka']);
  assert.deepEqual(addSavedStation(ids, 'otemachi'), ids);
  assert.deepEqual(addSavedStation(ids, 'daimon'), ids);
  assert.deepEqual(
    addSavedStation(
      ids.filter((id) => id !== 'daimon'),
      'otemachi',
    ),
    ['gotanda', 'asakusa', 'shinjuku', 'hikarigaoka', 'otemachi'],
  );
});

test('保存された登録駅を検証して復元し、不正なJSONや保存拒否でも継続する', () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  let value: string | null = JSON.stringify(['daimon', 'daimon', null, 'gotanda']);
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: () => value,
      setItem: (key: string, next: string) => {
        assert.equal(key, SAVED_STATIONS_KEY);
        value = next;
      },
    },
  });
  try {
    assert.deepEqual(loadSavedStations(), ['daimon', 'gotanda']);
    storeSavedStations(['asakusa', 'gotanda']);
    assert.deepEqual(loadSavedStations(), ['asakusa', 'gotanda']);
    for (const broken of ['{broken', '{}', 'null']) {
      value = broken;
      assert.deepEqual(loadSavedStations(), []);
    }
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      get() {
        throw new DOMException('blocked', 'SecurityError');
      },
    });
    assert.deepEqual(loadSavedStations(), []);
    assert.doesNotThrow(() => storeSavedStations(['gotanda']));
    assert.deepEqual(addSavedStation([], 'gotanda'), ['gotanda']);
  } finally {
    if (original) Object.defineProperty(globalThis, 'localStorage', original);
    else Reflect.deleteProperty(globalThis, 'localStorage');
  }
});
