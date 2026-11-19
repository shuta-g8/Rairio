import test from 'node:test';
import assert from 'node:assert/strict';
import {
  JOURNEY_HISTORY_KEY,
  loadJourneyHistory,
  rememberJourneyPlace,
  validJourneyHistory,
} from '../src/lib/journey-search-history.ts';

function withStorage(blocked: boolean, callback: (values: Map<string, string>) => void) {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const values = new Map<string, string>();
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    get() {
      if (blocked) throw new Error('blocked');
      return {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => values.set(key, value),
      };
    },
  });
  try {
    callback(values);
  } finally {
    if (previous) Object.defineProperty(globalThis, 'localStorage', previous);
    else Reflect.deleteProperty(globalThis, 'localStorage');
  }
}
test('履歴は関東の駅も保存し、再選択を先頭へ移し5件に制限する', () =>
  withStorage(false, (values) => {
    const ids = ['togoshi', 'kachidoki', 'shinjuku', 'daimon', 'asakusa', 'kanto:1130105'];
    let history: string[] = [];
    for (const id of ids) history = rememberJourneyPlace(id, history);
    assert.equal(history.length, 5);
    assert.equal(history[0], 'kanto:1130105');
    assert.ok(!history.includes('togoshi'));
    history = rememberJourneyPlace('shinjuku', history);
    assert.equal(history[0], 'shinjuku');
    assert.equal(history.filter((id) => id === 'shinjuku').length, 1);
    assert.deepEqual(loadJourneyHistory(), history);
    assert.deepEqual(JSON.parse(values.get(JOURNEY_HISTORY_KEY)!), history);
  }));
test('未知の駅・不正な保存形式を履歴に表示しない', () =>
  withStorage(false, (values) => {
    assert.deepEqual(validJourneyHistory(['unknown', 42, 'togoshi', 'togoshi']), ['togoshi']);
    for (const raw of ['{broken', 'null', '{}']) {
      values.set(JOURNEY_HISTORY_KEY, raw);
      assert.deepEqual(loadJourneyHistory(), []);
    }
  }));
test('保存領域が使えなくても駅選択を継続する', () =>
  withStorage(true, () => {
    assert.deepEqual(loadJourneyHistory(), []);
    assert.deepEqual(rememberJourneyPlace('togoshi', []), ['togoshi']);
  }));
