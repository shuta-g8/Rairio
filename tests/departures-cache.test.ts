import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { STATIONS } from '../shared/stations.ts';
import type { Route, Departure, StationData } from '../src/types.ts';
import { reviewedStation } from './helpers/reviewed-station.ts';
import {
  addDays,
  serviceDate,
  dayKind,
  departureTimestamp,
  boardDepartures,
  nextDepartures,
} from '../src/lib/time.ts';

// The previous filter/sort algorithm is kept as an independent regression oracle.
function reference(route: Route, now: Date, holdMs: number): Departure[] {
  const result: Departure[] = [];
  for (let offset = -1; offset < 3; offset++) {
    const date = addDays(serviceDate(now), offset);
    const day = dayKind(date);
    const schedules =
      route.timetableEditions?.find(
        (e) =>
          e.effectiveFrom <= date &&
          (e.effectiveToExclusive === null || date < e.effectiveToExclusive),
      )?.schedules ?? route.schedules;
    for (const train of schedules[day]) {
      const timestamp = departureTimestamp(date, train.time, train.dayOffset);
      if (holdMs ? timestamp + holdMs > now.getTime() : timestamp >= now.getTime()) {
        result.push({ ...train, timestamp, serviceDate: date, day });
      }
    }
  }
  return result.sort((a, b) => a.timestamp - b.timestamp);
}

test('全駅・全方面・全曜日で、時刻表キャッシュの出力が元の処理と一致する', async () => {
  for (const station of STATIONS) {
    const data: StationData = await reviewedStation(station.id);
    for (const route of data.routes)
      for (const date of ['2026-10-23', '2026-10-24', '2026-11-03']) {
        const samples = new Set(
          ['00:00', '03:59', '04:00', '12:01', '23:59'].map((time) =>
            Date.parse(`${date}T${time}:00+09:00`),
          ),
        );
        const schedule = route.schedules[dayKind(date)];
        for (const train of [
          schedule[0],
          schedule[Math.floor(schedule.length / 2)],
          schedule.at(-1),
        ]) {
          if (!train) continue;
          const timestamp = departureTimestamp(date, train.time, train.dayOffset);
          for (const delta of [-60001, -60000, -1, 0, 19999, 20000]) samples.add(timestamp + delta);
        }
        // Deliberately jump backwards and across the 04:00 service-day boundary.
        for (const timestamp of [...samples].sort((a, b) => b - a)) {
          const now = new Date(timestamp);
          for (const [hold, find] of [
            [0, nextDepartures],
            [20000, boardDepartures],
          ] as const) {
            const expected = reference(route, now, hold);
            for (const count of [-Infinity, -1, 0, 1, 2, 5, 1.5, NaN, Infinity]) {
              assert.deepEqual(
                find(route, now, count),
                expected.slice(0, count),
                `${station.id}/${route.id}/${now.toISOString()}/${count}/${hold}`,
              );
            }
          }
        }
      }
  }
});

test('データ更新と配列置換で再計算し、返却した列車の変更を次回へ持ち越さない', () => {
  const data: StationData = JSON.parse(readFileSync('public/data/mita.json', 'utf8'));
  const route = data.routes.find((r) => r.railwayId === 'Mita')!;
  const now = new Date('2026-10-23T12:01:00+09:00');
  const before = boardDepartures(route, now);
  before[0].destination = 'changed';
  assert.notEqual(boardDepartures(route, now)[0].destination, 'changed');
  route.schedules.weekday = [{ time: '12:02', type: '普通', destination: 'updated' }];
  assert.equal(boardDepartures(route, now)[0].destination, 'updated');
  const refreshed = structuredClone(route);
  refreshed.schedules.weekday[0].destination = 'new dataset';
  assert.equal(boardDepartures(refreshed, now)[0].destination, 'new dataset');
});
