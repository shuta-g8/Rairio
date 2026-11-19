import test from 'node:test';
import assert from 'node:assert/strict';
import { RAILWAYS, OPERATIONS_INTERVAL } from '../shared/railways.ts';
import {
  validSnapshot,
  groupOperations,
  summarizeOperations,
  operationsAreOld,
} from '../src/lib/operations.ts';
// @ts-expect-error Shared module also runs in Node and Vite.
import { createOperationsProvider, parseOperations } from '../server/operations.mjs';

const stamp = Date.parse('2026-11-01T12:00:00+09:00');
const data = () =>
  RAILWAYS.map((r) => ({
    'odpt:operator': 'odpt.Operator:Toei',
    'odpt:railway': `odpt.Railway:Toei.${r.id}`,
    'dc:date': new Date(stamp).toISOString(),
    'dct:valid': new Date(stamp + OPERATIONS_INTERVAL).toISOString(),
    'odpt:trainInformationText': { ja: '現在、１５分以上の遅延はありません。' },
  }));
const parse = (value = data()) => parseOperations(value, new Date(stamp).toISOString());

test('15分以上の遅延なしを遅延と誤判定せず、提供元のしきい値を保つ', () => {
  const snapshot = parse();
  assert.ok(validSnapshot(snapshot));
  assert.equal(snapshot.lines.length, 4);
  assert.ok(snapshot.lines.every((line: { state: string }) => line.state === 'normal'));
  assert.match(snapshot.lines[0].status, /15分以上/);
  assert.match(summarizeOperations(snapshot).text, /15分以上/);
  assert.equal(groupOperations(snapshot).length, 1);
});

test('欠落・期限切れ・他社データ・空文は未確認になり、古い平常情報を最新として出さない', () => {
  const missing = parse(data().slice(1));
  assert.equal(missing.lines[0].state, 'unknown');
  const expired = data();
  expired[0]['dct:valid'] = new Date(stamp).toISOString();
  assert.equal(parse(expired).lines[0].state, 'unknown');
  const other = data();
  other[0]['odpt:operator'] = 'odpt.Operator:Other';
  assert.equal(parse(other).lines[0].state, 'unknown');
  const empty = data();
  empty[0]['odpt:trainInformationText'].ja = '';
  assert.equal(parse(empty).lines[0].state, 'unknown');
  assert.throws(() => parse([]));
  assert.throws(() => parseOperations('<html>maintenance</html>'));
  assert.match(summarizeOperations(missing).text, /未確認/);
});

test('運転見合わせを最優先に集計し、公式の詳細文と発表時刻を保持する', () => {
  const value = data();
  value[0]['odpt:trainInformationText'].ja = '車両点検により遅れが出ています。';
  value[1]['odpt:trainInformationText'].ja = '一部区間で運転を見合わせています。';
  const snapshot = parse(value);
  assert.equal(snapshot.lines[0].state, 'delayed');
  assert.equal(snapshot.lines[1].state, 'suspended');
  assert.equal(groupOperations(snapshot)[0].state, 'suspended');
  assert.equal(summarizeOperations(snapshot).state, 'suspended');
  assert.match(summarizeOperations(snapshot).text, /車両点検/);
  assert.equal(
    validSnapshot({ ...snapshot, lines: [snapshot.lines[0], snapshot.lines[0]] }),
    false,
  );
});

test('案内文の末尾に路線別の発表時刻を日本時間で表示し、更新時刻で代用しない', () => {
  const value = data();
  value[0]['odpt:trainInformationText'].ja = '一部列車に遅れが出ています。';
  value[1]['odpt:trainInformationText'].ja = '運転を見合わせています。';
  Object.assign(value[0], { 'odpt:timeOfOrigin': '2026-11-01T02:03:00Z' });
  Object.assign(value[1], { 'odpt:timeOfOrigin': '2026-11-01T02:45:00Z' });
  const snapshot = parse(value);
  assert.ok(validSnapshot(snapshot));
  assert.equal(snapshot.lines[0].announcedAt, '2026-11-01T02:03:00.000Z');
  assert.equal(
    summarizeOperations(snapshot).text,
    `${RAILWAYS[0].operator}・${RAILWAYS[0].name}：一部列車に遅れが出ています。（11時03分発表）　${RAILWAYS[1].operator}・${RAILWAYS[1].name}：運転を見合わせています。（11時45分発表）`,
  );
  for (const origin of [undefined, 'invalid']) {
    Object.assign(value[0], { 'odpt:timeOfOrigin': origin });
    const withoutOrigin = parse(value);
    assert.equal(withoutOrigin.lines[0].announcedAt, undefined);
    assert.ok(!summarizeOperations(withoutOrigin).text.includes('11時03分発表'));
    assert.ok(!summarizeOperations(withoutOrigin).text.includes('12時00分発表'));
  }
  snapshot.lines[0].announcedAt = 'invalid';
  assert.equal(validSnapshot(snapshot), false);
});

test('同時取得を集約し、5分キャッシュの失敗時には古い取得日時と前回表示を保つ', async () => {
  let now = stamp,
    calls = 0;
  const provider = createOperationsProvider({
    now: () => now,
    fetchImpl: async () => {
      calls++;
      if (calls > 1) throw new Error('offline');
      return Response.json(data());
    },
  });
  const [first, second] = await Promise.all([provider.get(), provider.get()]);
  assert.equal(calls, 1);
  assert.deepEqual(first, second);
  now += OPERATIONS_INTERVAL - 1;
  await provider.get();
  assert.equal(calls, 1);
  now += 2;
  const previous = await provider.get();
  assert.equal(calls, 2);
  assert.equal(previous.cached, true);
  assert.equal(previous.fetchedAt, first.fetchedAt);
  assert.equal(operationsAreOld(previous, new Date(now)), true);
});

test('初回のHTTPエラーとリダイレクトは平常情報に変換しない', async () => {
  for (const status of [302, 503]) {
    const provider = createOperationsProvider({
      fetchImpl: async (_url: string, options: RequestInit) => {
        assert.equal(options.redirect, 'manual');
        return new Response('', { status });
      },
    });
    await assert.rejects(provider.get(), new RegExp(String(status)));
  }
});
