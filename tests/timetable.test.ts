import test from 'node:test';
import assert from 'node:assert/strict';
import { groupTimetableByHour } from '../src/lib/timetable.ts';
import type { Train } from '../src/types.ts';

test('深夜便を24時以降へまとめ、列車の順序と明示的な日付指定を保持する', () => {
  const trains: Train[] = [
    { time: '23:55', destination: 'A', type: '普通' },
    { time: '00:05', destination: 'B', type: '普通' },
    { time: '24:10', destination: 'C', type: '急行' },
    { time: '03:30', destination: 'D', type: '普通' },
    { time: '06:45', destination: 'E', type: '普通', dayOffset: 1 },
    { time: '00:15', destination: 'F', type: '普通', dayOffset: 0 },
  ];
  const original = structuredClone(trains);
  const groups = groupTimetableByHour(trains);
  assert.deepEqual([...groups.keys()], [23, 24, 27, 30, 0]);
  assert.deepEqual(
    groups.get(24)?.map((train) => train.destination),
    ['B', 'C'],
  );
  assert.deepEqual(groups.get(0), [trains[5]]);
  assert.deepEqual(trains, original);
});

test('発車予定がないダイヤには時間帯を追加しない', () => {
  assert.equal(groupTimetableByHour([]).size, 0);
});
