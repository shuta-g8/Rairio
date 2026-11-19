import test from 'node:test';
import assert from 'node:assert/strict';
import { selectToeiTextWidths, type ToeiWidthMeasurements } from '../src/lib/toei-text-width.ts';

const widths = (normal: number): ToeiWidthMeasurements => ({
  100: normal,
  80: normal * 0.8,
  70: normal * 0.7,
  60: normal * 0.6,
});

test('収まる文字は通常幅を保ち、片側だけで収まる場合はもう片側を変更しない', () => {
  assert.deepEqual(selectToeiTextWidths(widths(100), widths(100), 200), {
    names: 100,
    translations: 100,
  });
  assert.deepEqual(selectToeiTextWidths(widths(100), widths(100), 180), {
    names: 100,
    translations: 80,
  });
  assert.deepEqual(selectToeiTextWidths(widths(200), widths(50), 220), {
    names: 80,
    translations: 100,
  });
  assert.deepEqual(selectToeiTextWidths(widths(50), widths(200), 190), {
    names: 100,
    translations: 70,
  });
  assert.deepEqual(selectToeiTextWidths(widths(50), widths(200), 175), {
    names: 100,
    translations: 60,
  });
  // Even two 80% faces would fit: a single 60% face still preserves the other side.
  assert.deepEqual(selectToeiTextWidths(widths(100), widths(100), 160), {
    names: 100,
    translations: 60,
  });
});

test('片側60%でも不足する場合のみ両側を調整し、必要以上に狭くしない', () => {
  assert.deepEqual(selectToeiTextWidths(widths(100), widths(100), 155), {
    names: 80,
    translations: 70,
  });
  assert.deepEqual(selectToeiTextWidths(widths(100), widths(100), 140), {
    names: 70,
    translations: 70,
  });
  assert.deepEqual(selectToeiTextWidths(widths(100), widths(100), 120), {
    names: 60,
    translations: 60,
  });
});

test('番号アイコンや経由の固定幅も含めた実測値で判断する', () => {
  const names = { 100: 150, 80: 130, 70: 120, 60: 110 };
  assert.deepEqual(selectToeiTextWidths(names, widths(100), 210), { names: 100, translations: 60 });
  assert.deepEqual(selectToeiTextWidths(names, widths(100), 190), { names: 70, translations: 70 });
});
