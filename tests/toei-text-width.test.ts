import test from 'node:test';
import assert from 'node:assert/strict';
import { selectToeiTextWidth } from '../src/lib/toei-text-width.ts';

test('区画に収まる最大の文字幅を選ぶ', () => {
  const widths = { 100: 150, 80: 130, 70: 120, 60: 110 };
  assert.equal(selectToeiTextWidth(widths, 150), 100);
  assert.equal(selectToeiTextWidth(widths, 149), 80);
  assert.equal(selectToeiTextWidth(widths, 129), 70);
  assert.equal(selectToeiTextWidth(widths, 119), 60);
  assert.equal(selectToeiTextWidth(widths, 90), 60);
});
