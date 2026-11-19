import test from 'node:test';
import assert from 'node:assert/strict';
import {
  readStoredJson,
  readStoredValue,
  writeStoredJson,
  writeStoredValue,
  clearLegacyTransitData,
} from '../src/lib/storage.ts';
import { loadPreferredStation, savePreferredStation } from '../src/lib/station-preference.ts';

const isRecord = (value: unknown): value is { id: string } =>
  !!value && typeof value === 'object' && typeof (value as { id?: unknown }).id === 'string';

test('Storage APIで旧データをすべて削除し、現在の駅と検索履歴は残す', () => {
  const values = new Map([
    ['kanto:station:v1:gotanda', 'old station'],
    ['kanto:operations:v1', 'old operations'],
    ['kanto:station:v1:togoshi', 'another old station'],
    ['rairio:station:v1', 'gotanda'],
    ['rairio:recent-stations:v1', '["gotanda"]'],
  ]);
  withStorage(
    () => ({
      get length() {
        return values.size;
      },
      key: (index: number) => [...values.keys()][index] ?? null,
      removeItem: (key: string) => values.delete(key),
    }),
    () => {
      clearLegacyTransitData();
      assert.deepEqual([...values.keys()], ['rairio:station:v1', 'rairio:recent-stations:v1']);
    },
  );
});

test('旧キャッシュを1件削除できなくても、他の旧データの削除を続ける', () => {
  const values = new Map([
    ['kanto:operations:v1', 'old operations'],
    ['kanto:station:v1:gotanda', 'old station'],
  ]);
  withStorage(
    () => ({
      get length() {
        return values.size;
      },
      key: (index: number) => [...values.keys()][index] ?? null,
      removeItem: (key: string) => {
        if (key === 'kanto:operations:v1') throw new DOMException('blocked', 'SecurityError');
        values.delete(key);
      },
    }),
    () => {
      assert.doesNotThrow(clearLegacyTransitData);
      assert.equal(values.has('kanto:station:v1:gotanda'), false);
    },
  );
});

function withStorage(get: () => unknown, callback: () => void) {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, get });
  try {
    callback();
  } finally {
    if (original) Object.defineProperty(globalThis, 'localStorage', original);
    else Reflect.deleteProperty(globalThis, 'localStorage');
  }
}

test('保存形式を変えず、JSONの破損・異なる形式・欠落を拒否する', () => {
  const values = new Map<string, string>();
  withStorage(
    () => ({
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    }),
    () => {
      writeStoredValue('raw', 'daimon');
      assert.equal(readStoredValue('raw'), 'daimon');
      writeStoredJson('json', { id: 'togoshi' });
      assert.equal(values.get('json'), '{"id":"togoshi"}');
      assert.deepEqual(readStoredJson('json', isRecord), { id: 'togoshi' });
      values.set('json', '{broken');
      assert.equal(readStoredJson('json', isRecord), null);
      values.set('json', '{"id":123}');
      assert.equal(readStoredJson('json', isRecord), null);
      assert.equal(readStoredJson('missing', isRecord), null);
      savePreferredStation('shimbashi');
      assert.equal(values.get('rairio:station:v1'), 'shimbashi');
      assert.equal(loadPreferredStation(), 'shimbashi');
    },
  );
});

test('保存領域へのアクセス自体が拒否されても、駅の既定値と読み込みを保つ', () => {
  withStorage(
    () => {
      throw new DOMException('blocked', 'SecurityError');
    },
    () => {
      assert.equal(readStoredValue('key'), null);
      assert.equal(readStoredJson('key', isRecord), null);
      assert.equal(loadPreferredStation(), 'shinjuku');
      assert.doesNotThrow(() => savePreferredStation('daimon'));
      assert.doesNotThrow(() => writeStoredJson('key', { id: 'togoshi' }));
    },
  );
});

test('容量超過と循環参照による保存失敗を画面側へ伝播させない', () => {
  withStorage(
    () => ({
      getItem: () => null,
      setItem: () => {
        throw new DOMException('full', 'QuotaExceededError');
      },
    }),
    () => {
      const circular: { self?: unknown } = {};
      circular.self = circular;
      assert.doesNotThrow(() => writeStoredValue('key', 'value'));
      assert.doesNotThrow(() => writeStoredJson('key', { id: 'togoshi' }));
      assert.doesNotThrow(() => writeStoredJson('key', circular));
    },
  );
});
