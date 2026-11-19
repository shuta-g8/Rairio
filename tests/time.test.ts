import test from 'node:test';
import assert from 'node:assert/strict';
import {
  addDays,
  boardDepartures,
  dayKind,
  departureBoardState,
  departurePresentation,
  departureTimestamp,
  japanDate,
  isFutureJapanDate,
  japanHour,
  nextDepartures,
  remaining,
  serviceDate,
  serviceHour,
} from '../src/lib/time.ts';
import type { Route } from '../src/types.ts';

const train = (time: string, destination = 'テスト行先') => ({ time, destination, type: '普通' });

test('翌日表示はJSTで未来の日付だけに付け、前日の残留案内には付けない', () => {
  const now = new Date('2026-11-13T00:00:02+09:00');
  assert.equal(isFutureJapanDate(Date.parse('2026-11-12T23:59:00+09:00'), now), false);
  assert.equal(isFutureJapanDate(Date.parse('2026-11-13T00:10:00+09:00'), now), false);
  assert.equal(
    isFutureJapanDate(
      Date.parse('2026-11-13T00:10:00+09:00'),
      new Date('2026-11-12T23:59:59+09:00'),
    ),
    true,
  );
});

test('照合済みの接近・遠方を予定時刻より優先し、未取得なら時刻表へ戻す', () => {
  const timestamp = Date.parse('2026-10-23T12:00:00+09:00');
  for (const offset of [-300000, -30000, 0, 10000]) {
    const now = new Date(timestamp + offset);
    assert.equal(departurePresentation(timestamp, now, true).kind, 'approaching');
    assert.equal(departurePresentation(timestamp, now, false).kind, 'countdown');
    assert.deepEqual(
      departurePresentation(timestamp, now, undefined),
      departurePresentation(timestamp, now),
    );
  }
});
const route: Route = {
  id: 'test',
  line: 'テスト線',
  direction: 'テスト',
  color: '#000000',
  sourceUrl: 'https://example.com',
  schedules: {
    weekday: [train('05:01'), train('23:55'), train('00:12')],
    saturday: [train('05:11'), train('23:51'), train('00:15')],
    holiday: [train('05:21'), train('23:45'), train('00:19')],
  },
};

test('日本時間の日付と営業日を端末タイムゾーンに依存せず求める', () => {
  const now = new Date('2026-10-23T15:02:00Z');
  assert.equal(japanDate(now), '2026-10-24');
  assert.equal(japanHour(now), 0);
  assert.equal(serviceHour(japanHour(now)), 24);
  assert.equal(serviceDate(now), '2026-10-23');
  assert.equal(serviceDate(new Date('2026-10-24T04:00:00+09:00')), '2026-10-24');
});

test('営業日の時間表記は4時を境界とし、明示された日付オフセットを優先する', () => {
  assert.equal(serviceHour(3), 27);
  assert.equal(serviceHour(4), 4);
  assert.equal(serviceHour(23), 23);
  assert.equal(serviceHour(24), 24);
  assert.equal(serviceHour(0, 0), 0);
  assert.equal(serviceHour(6, 1), 30);
});

test('平日・土曜・日祝・振替休日・年末年始を切り替える', () => {
  assert.equal(dayKind('2026-10-23'), 'weekday');
  assert.equal(dayKind('2026-10-24'), 'saturday');
  assert.equal(dayKind('2026-10-25'), 'holiday');
  assert.equal(dayKind('2026-11-03'), 'holiday');
  assert.equal(dayKind('2026-05-06'), 'holiday');
  assert.equal(dayKind('2026-12-30'), 'holiday');
  assert.equal(dayKind('2027-01-02'), 'holiday');
});

test('同じDateの変更・時計の巻き戻り・不正な日時でも営業日の判定を保つ', () => {
  const now = new Date('2026-10-24T03:59:59.999+09:00');
  assert.equal(serviceDate(now), '2026-10-23');
  assert.equal(serviceDate(new Date(now)), '2026-10-23');
  now.setTime(Date.parse('2026-10-24T04:00:00+09:00'));
  assert.equal(serviceDate(now), '2026-10-24');
  now.setTime(Date.parse('2026-10-23T23:59:59+09:00'));
  assert.equal(serviceDate(now), '2026-10-23');
  assert.throws(() => serviceDate(new Date(NaN)), RangeError);
  assert.equal(serviceDate(now), '2026-10-23');
});

test('土曜の午前0時台は金曜ダイヤの深夜便を先発にする', () => {
  const departures = nextDepartures(route, new Date('2026-10-24T00:02:00+09:00'));
  assert.deepEqual(
    departures.map((d) => [d.time, d.day]),
    [
      ['00:12', 'weekday'],
      ['05:11', 'saturday'],
    ],
  );
  assert.equal(new Date(departures[0].timestamp).toISOString(), '2026-10-23T15:12:00.000Z');
});

test('終電後は翌営業日のダイヤから始発と次発を選ぶ', () => {
  const departures = nextDepartures(route, new Date('2026-10-26T01:00:00+09:00'));
  assert.deepEqual(
    departures.map((d) => [d.time, d.day]),
    [
      ['05:01', 'weekday'],
      ['23:55', 'weekday'],
    ],
  );
});

test('現在時刻を過ぎた発車を除外し、同じ時刻の別列車は保持する', () => {
  const duplicate: Route = {
    ...route,
    schedules: {
      ...route.schedules,
      weekday: [train('10:00'), train('10:01', 'A'), train('10:01', 'B')],
    },
  };
  const departures = nextDepartures(duplicate, new Date('2026-10-23T10:00:01+09:00'));
  assert.deepEqual(
    departures.map((d) => d.destination),
    ['A', 'B'],
  );
  assert.equal(nextDepartures(route, new Date('2026-10-23T05:01:00+09:00'))[0].time, '05:01');
});

test('0時台を翌日として計算し、残り時間を負数にしない', () => {
  assert.equal(
    new Date(departureTimestamp('2026-10-23', '00:12')).toISOString(),
    '2026-10-23T15:12:00.000Z',
  );
  const now = new Date('2026-10-23T10:00:00+09:00');
  assert.deepEqual(remaining(now.getTime() + 65001, now), { minutes: 1, seconds: 6 });
  assert.deepEqual(remaining(now.getTime() - 1000, now), { minutes: 0, seconds: 0 });
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
});

test('30時台の夜行列車を、前営業日から翌朝へ正しく引き継ぐ', () => {
  const sleeper: Route = {
    ...route,
    schedules: {
      weekday: [{ ...train('06:45'), dayOffset: 1 }, train('07:00')],
      saturday: [train('07:10')],
      holiday: [train('07:20')],
    },
  };
  const departures = nextDepartures(sleeper, new Date('2026-10-24T06:00:00+09:00'));
  assert.deepEqual(
    departures.map((d) => [d.time, d.day]),
    [
      ['06:45', 'weekday'],
      ['07:10', 'saturday'],
    ],
  );
  assert.equal(new Date(departures[0].timestamp).toISOString(), '2026-10-23T21:45:00.000Z');
});

test('定刻1分前・15秒前・5秒後・20秒後の境界で、接近・発車案内と進捗を切り替える', () => {
  const departure = Date.parse('2026-10-23T12:04:00+09:00');
  assert.deepEqual(departurePresentation(departure, new Date(departure - 60001)), {
    kind: 'countdown',
  });
  assert.deepEqual(departurePresentation(departure, new Date(departure - 60000)), {
    kind: 'approaching',
  });
  assert.deepEqual(departurePresentation(departure, new Date(departure - 15001)), {
    kind: 'approaching',
  });
  for (const offset of [-15000, -1, 0, 4999]) {
    assert.deepEqual(departurePresentation(departure, new Date(departure + offset)), {
      kind: 'departing',
    });
  }
  assert.deepEqual(departurePresentation(departure, new Date(departure + 5000)), {
    kind: 'progress',
    elapsedMs: 0,
    progress: 0,
  });
  assert.deepEqual(departurePresentation(departure, new Date(departure + 10000)), {
    kind: 'progress',
    elapsedMs: 5000,
    progress: 1 / 3,
  });
  assert.deepEqual(departurePresentation(departure, new Date(departure + 12500)), {
    kind: 'progress',
    elapsedMs: 7500,
    progress: 0.5,
  });
  assert.equal(departurePresentation(departure, new Date(departure + 19999)).kind, 'progress');
  assert.deepEqual(departurePresentation(departure, new Date(departure + 20000)), {
    kind: 'expired',
  });
});

test('同時発車の案内を20秒維持し、経過後に後続列車を先発へ繰り上げる', () => {
  const board: Route = {
    ...route,
    schedules: {
      ...route.schedules,
      weekday: [train('10:00', 'A'), train('10:00', 'B'), train('10:01', 'C')],
    },
  };
  assert.deepEqual(
    boardDepartures(board, new Date('2026-10-23T10:00:19.999+09:00')).map((d) => d.destination),
    ['A', 'B'],
  );
  assert.equal(boardDepartures(board, new Date('2026-10-23T10:00:20+09:00'))[0].destination, 'C');
  assert.equal(nextDepartures(board, new Date('2026-10-23T10:00:01+09:00'))[0].destination, 'C');
});

test('深夜便の保持時間が経過すると、翌営業日の始発を表示する', () => {
  const held = boardDepartures(route, new Date('2026-10-24T00:12:19.999+09:00'));
  assert.deepEqual(
    held.map((d) => [d.time, d.day]),
    [
      ['00:12', 'weekday'],
      ['05:11', 'saturday'],
    ],
  );
  assert.equal(boardDepartures(route, new Date('2026-10-24T00:12:20+09:00'))[0].time, '05:11');
});

test('終電の20秒保持後は終了案内と翌営業日の最初の電車を組み合わせる', () => {
  const holding = departureBoardState(route, new Date('2026-10-24T00:12:19.999+09:00'));
  assert.equal(holding.kind, 'active');
  const ended = departureBoardState(route, new Date('2026-10-24T00:12:20+09:00'));
  assert.equal(ended.kind, 'ended');
  if (ended.kind !== 'ended') throw new Error('Expected ended board');
  assert.equal(ended.nextDeparture.time, '05:11');
  assert.equal(ended.nextDeparture.day, 'saturday');
  assert.equal(ended.nextDeparture.serviceDate, '2026-10-24');
  assert.equal(departureBoardState(route, new Date('2026-10-24T04:00:00+09:00')).kind, 'active');
});

test('祝日の始発・前営業日の30時台・空ダイヤでも発車案内の状態を判定する', () => {
  const ended = departureBoardState(route, new Date('2026-10-25T02:00:00+09:00'));
  assert.equal(ended.kind, 'ended');
  if (ended.kind !== 'ended') throw new Error('Expected ended board');
  assert.equal(ended.nextDeparture.time, '05:21');
  assert.equal(ended.nextDeparture.day, 'holiday');
  const sleeper = {
    ...route,
    schedules: { ...route.schedules, weekday: [{ ...train('06:45'), dayOffset: 1 }] },
  };
  assert.equal(departureBoardState(sleeper, new Date('2026-10-24T06:00:00+09:00')).kind, 'active');
  assert.deepEqual(
    departureBoardState(
      { ...route, schedules: { weekday: [], saturday: [], holiday: [] } },
      new Date(),
    ),
    { kind: 'empty' },
  );
});
