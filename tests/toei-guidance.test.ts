import test from 'node:test';
import assert from 'node:assert/strict';
import {
  shuffledGuidanceIds,
  TOEI_GUIDANCE,
  toeiInformationMessages,
} from '../src/lib/toei-guidance.ts';

test('各巡はすべての案内を重複なく含み、巡の境界でも直前の案内を繰り返さない', () => {
  const ids = TOEI_GUIDANCE.map((message) => message.id);
  assert.equal(new Set(ids).size, ids.length);
  let last: string | undefined;
  const orders = new Set<string>();
  for (const value of [0, 0.25, 0.5, 0.75, 0.999]) {
    const order = shuffledGuidanceIds(ids, last, () => value);
    assert.deepEqual([...order].sort(), [...ids].sort());
    assert.notEqual(order[0], last);
    orders.add(order.join(','));
    last = order.at(-1);
  }
  assert.ok(orders.size > 1);
  assert.deepEqual(shuffledGuidanceIds(['operation'], 'operation'), ['operation']);
  assert.deepEqual(shuffledGuidanceIds([]), []);
});

test('取得できない運行状況を平常と断定せず、運行異常だけは一般案内より優先する', () => {
  assert.equal(
    toeiInformationMessages(undefined, false).some((message) => message.id === 'no-delays'),
    false,
  );
  const operation = {
    id: 'Oedo',
    state: 'delayed',
    status: '遅延',
    message: '安全確認中です。',
  } as const;
  const messages = toeiInformationMessages(operation, true);
  assert.deepEqual(
    messages.map((message) => message.id),
    ['operation', ...TOEI_GUIDANCE.map((message) => message.id)],
  );
  assert.equal(
    messages[0].segments.map((segment) => segment.text).join(''),
    '【運行情報】前回取得時：安全確認中です。',
  );
});
