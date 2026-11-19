import test from 'node:test';
import assert from 'node:assert/strict';
import {
  loadRecentStations,
  rememberRecentStation,
  RECENT_STATIONS_KEY,
} from '../src/lib/station-search-history.ts';

function withStorage(values: Map<string, string> | null, callback: () => void) {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    get() {
      if (!values) throw new DOMException('Storage blocked', 'SecurityError');
      return {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => values.set(key, value),
      };
    },
  });
  try {
    callback();
  } finally {
    if (original) Object.defineProperty(globalThis, 'localStorage', original);
    else Reflect.deleteProperty(globalThis, 'localStorage');
  }
}

test('検索履歴は有効な駅だけを重複なく3件読み込み、壊れた保存を無視する', () => {
  const values = new Map([
    [
      RECENT_STATIONS_KEY,
      JSON.stringify(['unknown', 'daimon', 'daimon', 42, 'gotanda', 'asakusa', 'hikarigaoka']),
    ],
  ]);
  withStorage(values, () => {
    assert.deepEqual(loadRecentStations(), ['daimon', 'gotanda', 'asakusa']);
    for (const value of ['{broken', '{"station":"daimon"}', 'null']) {
      values.set(RECENT_STATIONS_KEY, value);
      assert.deepEqual(loadRecentStations(), []);
    }
  });
});

test('再選択した駅を先頭へ移し、最大3件の駅IDだけを保存する', () => {
  const values = new Map<string, string>();
  withStorage(values, () => {
    const recent = rememberRecentStation('gotanda', ['daimon', 'gotanda', 'togoshi']);
    assert.deepEqual(recent, ['gotanda', 'daimon', 'togoshi']);
    assert.deepEqual(rememberRecentStation('asakusa', recent), ['asakusa', 'gotanda', 'daimon']);
    assert.deepEqual(JSON.parse(values.get(RECENT_STATIONS_KEY)!), [
      'asakusa',
      'gotanda',
      'daimon',
    ]);
  });
});

test('保存領域が使えなくても履歴の読み込みと同一画面での更新を続ける', () => {
  withStorage(null, () => {
    assert.deepEqual(loadRecentStations(), []);
    assert.deepEqual(rememberRecentStation('daimon', ['gotanda']), ['daimon', 'gotanda']);
  });
});
