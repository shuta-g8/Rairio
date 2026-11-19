import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import type { Route, Train, StationData } from '../src/types.ts';
import type { TrainPositionsSnapshot } from '../shared/train-positions.ts';
import {
  resolveHybridDepartures as resolve,
  hybridTimeline,
  HYBRID_LIMITS,
  type HybridDepartureSession,
} from '../src/lib/hybrid-departures.ts';
import { resolveLiveDepartures } from '../src/lib/live-departures.ts';
import { reviewedStation } from './helpers/reviewed-station.ts';

const T = Date.parse('2026-11-15T10:05:00+09:00');
const id = 'odpt.Train:Toei.Oedo.HYBRID';
function route(
  trains: Train[] = [
    { time: '10:05', destination: '光が丘', type: '普通', trainId: id },
    { time: '10:06', destination: '都庁前', type: '普通', trainId: id + '-next' },
    { time: '10:12', destination: '光が丘', type: '普通' },
  ],
): Route {
  const r = (
    JSON.parse(readFileSync('public/data/daimon.json', 'utf8')) as StationData
  ).routes.find((r) => r.id === 'Toei.Oedo.OuterLoop')!;
  return { ...r, schedules: { weekday: trains, saturday: trains, holiday: trains } };
}
function positions(seconds: number, stage = 'incoming', delay?: number): TrainPositionsSnapshot {
  const [from, to] = (
    {
      incoming: ['Shiodome', 'Daimon'],
      previous: ['Shiodome', null],
      here: ['Daimon', null],
      outgoing: ['Daimon', 'Akabanebashi'],
      clear: ['Akabanebashi', 'AzabuJuban'],
      nullDownstream: ['Akabanebashi', null],
      far: ['Tsukijishijo', 'Shiodome'],
    } as Record<string, [string, string | null]>
  )[stage];
  return {
    fetchedAt: new Date(T + seconds * 1000).toISOString(),
    trains: [
      {
        id,
        railwayId: 'Oedo',
        direction: 'OuterLoop',
        fromStation: `odpt.Station:Toei.Oedo.${from}`,
        toStation: to && `odpt.Station:Toei.Oedo.${to}`,
        updatedAt: new Date(T + seconds * 1000).toISOString(),
        validUntil: new Date(T + (seconds + 300) * 1000).toISOString(),
        delay,
      },
    ],
  };
}
const first = (d: ReturnType<typeof resolve>) =>
  d.board.kind === 'active' ? d.board.departures[0].time : d.board.kind;
const at = (seconds: number) => new Date(T + seconds * 1000);

function forecast(seconds: number, advance: number, lag = 0) {
  const raw = positions(seconds, 'here');
  const p = raw.trains[0];
  return {
    ...raw,
    collected: {
      fetchedAt: raw.fetchedAt,
      trains: [
        {
          ...p,
          projection: {
            at: at(advance).getTime(),
            fromStation: p.fromStation,
            toStation: 'odpt.Station:Toei.Oedo.Akabanebashi',
          },
          model: {
            runId: '2026-11-15/' + id + '/1',
            visit: 20,
            nextVisit: 20.5,
            lead: 60000,
            dwellUntil: T + 600000,
            usualExit: T,
            entryLag: lag * 1000,
          },
        },
      ],
    },
  };
}

function approachingForecast(seconds: number, arrival: number): TrainPositionsSnapshot {
  const raw = positions(seconds);
  const p = raw.trains[0];
  return {
    ...raw,
    collected: {
      fetchedAt: raw.fetchedAt,
      trains: [
        {
          ...p,
          model: {
            runId: '2026-11-15/' + id + '/1',
            visit: 19.5,
            nextVisit: 20,
            lead: 60000,
            dwellUntil: T + 600000,
          },
          projection: { at: at(arrival).getTime(), fromStation: p.toStation!, toStation: null },
        },
      ],
    },
  };
}

test('端末推定で前駅から走行中は50秒後も案内し、当駅到着で終了する', () => {
  const r = route();
  let d = resolve(r, at(-75), approachingForecast(-75, 20));
  assert.equal(d.presentation?.kind, 'approaching');
  d = resolve(r, at(-25), approachingForecast(-25, 20), d.session);
  assert.equal(d.presentation?.kind, 'approaching');
  d = resolve(r, at(19), approachingForecast(0, 20), d.session);
  assert.equal(d.estimatedDiagram?.segment, 'second');
  assert.equal(d.presentation?.kind, 'approaching');
  d = resolve(r, at(20), approachingForecast(0, 20), d.session);
  assert.equal(d.estimatedDiagram?.stage, 'here');
  assert.equal(d.presentation?.kind, 'countdown');
  assert.equal(first(d), '10:05');
});

test('遅着のSSE推定は端末予測より優先し、失効時には固定秒へ戻る', () => {
  const r = route();
  const data = approachingForecast(0, -10);
  const p = data.collected!.trains[0];
  data.serverEstimates = {
    validUntil: at(20).getTime(),
    trains: [
      {
        id,
        runId: p.model!.runId,
        visit: 19.5,
        fromStation: p.fromStation,
        toStation: p.toStation,
        delaySeconds: 0,
      },
    ],
  };
  const timedOut = resolve(r, at(-20), null);
  const incoming = resolve(r, at(0), data, timedOut.session);
  assert.equal(incoming.estimatedDiagram?.stage, 'previous');
  assert.equal(incoming.presentation?.kind, 'approaching');
  assert.equal(resolve(r, at(20), data, incoming.session).presentation?.kind, 'countdown');
  const http = { ...data, serverEstimates: undefined };
  const here = resolve(r, at(5), http, incoming.session);
  assert.equal(here.estimatedDiagram?.stage, 'here');
  assert.equal(here.presentation?.kind, 'countdown');
});

test('当駅手前の別区間は固定秒内でも案内せず、早着後の欠測で案内を再開しない', () => {
  const r = route();
  const upstream = approachingForecast(-70, 30);
  const p = upstream.collected!.trains[0];
  Object.assign(p, positions(-70, 'far').trains[0]);
  p.model!.visit = 18.5;
  const before = resolve(r, at(-70), upstream);
  assert.equal(before.presentation?.kind, 'countdown');
  const here = resolve(r, at(-60), forecast(-60, 45), before.session);
  assert.equal(here.presentation?.kind, 'countdown');
  assert.equal(resolve(r, at(-45), null, here.session).presentation?.kind, 'countdown');
});

test('same estimate holds the displayed train at the station and advances it exactly at estimated departure', () => {
  const r = route();
  let d = resolve(r, at(0), forecast(0, 45));
  assert.equal(d.estimatedDiagram?.stage, 'here');
  d = resolve(r, at(30), forecast(30, 45), d.session);
  assert.equal(first(d), '10:05');
  d = resolve(r, at(45), forecast(30, 45), d.session);
  assert.equal(first(d), '10:06');
  assert.equal(d.session.lastTurnover?.reason, 'estimate');
  assert.equal(first(resolve(r, at(46), forecast(45, 120), d.session)), '10:06');
  assert.equal(first(resolve(r, at(45), forecast(30, 45), undefined, false)), '10:05');
});

test('a confirmed 120s delay shifts the projected exit once, survives a missing feed and preserves approach timing', () => {
  const r = route();
  let d = resolve(r, at(-60), forecast(-60, -10, 120));
  assert.equal(d.diagnostic?.turnoverDelayMs, 0);
  d = resolve(r, at(-30), forecast(-30, -10, 120), d.session);
  assert.equal(d.diagnostic?.turnoverDelayMs, 120000);
  assert.equal(d.diagnostic?.approachStart, T - 75000);
  assert.equal(d.diagnostic?.switchAt, T + 150000);
  const absent = { ...positions(30), collected: null };
  assert.equal(first(resolve(r, at(149), absent, d.session)), '10:05');
  assert.notEqual(first(resolve(r, at(150), absent, d.session)), '10:05');
  const fresh = forecast(30, -10, 120);
  const next = {
    ...fresh.collected.trains[0],
    id: id + '-next',
    projection: { ...fresh.collected.trains[0].projection, at: T + 240000 },
    model: {
      ...fresh.collected.trains[0].model,
      runId: '2026-11-15/' + id + '-next/2',
      entryLag: 0,
    },
  };
  fresh.collected.trains.push(next);
  d = resolve(r, at(59), fresh, d.session);
  assert.equal(first(d), '10:05');
  d = resolve(r, at(60), fresh, d.session);
  assert.equal(first(d), '10:06');
  assert.equal(d.diagnostic?.turnoverDelayMs, 0);
});

test('first collector response can recover a late train skipped on a cold timetable read; expired data cannot hold it', () => {
  const r = route();
  const initial = resolve(r, at(40), null);
  assert.equal(first(initial), '10:06');
  const data = forecast(40, 180);
  const recovered = resolve(r, at(41), data, initial.session);
  assert.equal(first(recovered), '10:05');
  assert.notEqual(first(resolve(r, at(130), data, recovered.session)), '10:05');
});

test('遅延した先発が残る間は、後続2本の定刻を過ぎても直後の列車を次発にする', () => {
  const r = route(
    ['10:05', '10:06', '10:07', '10:08'].map((time, i) => ({
      time,
      destination: '光が丘',
      type: '普通',
      trainId: i ? id + '-' + i : id,
    })),
  );
  const times = (d: ReturnType<typeof resolve> | ReturnType<typeof resolveLiveDepartures>) =>
    d.board.kind === 'active' && d.board.departures.map((t) => t.time);
  const late = forecast(151, 260);
  const initial = resolve(r, at(151), null);
  const held = resolve(r, at(151), late, initial.session);
  assert.deepEqual(times(held), ['10:05', '10:06']);
  assert.deepEqual(times(resolve(r, at(152), null, held.session)), ['10:05', '10:06']);
  const server = {
    ...late,
    serverEstimates: {
      validUntil: at(171).getTime(),
      trains: [
        {
          id,
          runId: late.collected.trains[0].model.runId,
          visit: 20,
          fromStation: late.trains[0].fromStation,
          toStation: null,
          delaySeconds: 151,
        },
      ],
    },
  };
  assert.deepEqual(times(resolve(r, at(152), server, held.session)), ['10:05', '10:06']);
  const moved = forecast(155, 150);
  const following = {
    ...late.collected.trains[0],
    id: id + '-1',
    model: { ...late.collected.trains[0].model, runId: '2026-11-15/' + id + '-1/1' },
  };
  moved.collected.trains.push(following);
  assert.deepEqual(times(resolve(r, at(155), moved, held.session)), ['10:06', '10:07']);
  const observed = resolveLiveDepartures(r, at(151), positions(151, 'here'));
  assert.deepEqual(times(observed), ['10:05', '10:06']);
  const nextHere = positions(155, 'here').trains[0];
  nextHere.id = id + '-1';
  const after = positions(155, 'clear');
  after.trains.push(nextHere);
  assert.deepEqual(times(resolveLiveDepartures(r, at(155), after, observed.session)), [
    '10:06',
    '10:07',
  ]);
});

test('exact second boundaries: -75 inclusive, -25 exclusive, +30 turnover; timetable time stays original', () => {
  const r = route();
  let session: HybridDepartureSession | undefined;
  for (const [s, phase, time] of [
    [-76, 'countdown', '10:05'],
    [-75, 'approaching', '10:05'],
    [-26, 'approaching', '10:05'],
    [-25, 'countdown', '10:05'],
    [0, 'countdown', '10:05'],
    [29, 'countdown', '10:05'],
    [30, 'approaching', '10:06'],
  ] as const) {
    const d = resolve(r, at(s), null, session);
    session = d.session;
    assert.equal(d.presentation?.kind, phase);
    assert.equal(first(d), time);
  }
  assert.deepEqual(hybridTimeline(T), {
    approachStart: T - 75000,
    approachEnd: T - 25000,
    switchAt: T + 30000,
  });
});
for (const delay of [60, 120, 240])
  test(`${delay}s delay needs two fresh local observations and shifts the fixed time axis`, () => {
    const r = route([
      { time: '10:05', destination: '光が丘', type: '普通', trainId: id },
      { time: '10:20', destination: '光が丘', type: '普通' },
    ]);
    let d = resolve(r, at(-220), positions(-220, 'here', delay));
    assert.equal(d.diagnostic?.delayMs, 0);
    d = resolve(r, at(-190), positions(-190, 'here', delay), d.session);
    assert.equal(d.diagnostic?.delayMs, delay * 1000);
    for (const [s, kind] of [
      [delay - 76, 'countdown'],
      [delay - 75, 'approaching'],
      [delay - 26, 'approaching'],
      [delay - 25, 'countdown'],
      [delay + 29, 'countdown'],
    ] as const) {
      d = resolve(r, at(s), null, d.session);
      assert.equal(first(d), '10:05');
      assert.equal(d.presentation?.kind, kind);
    }
    d = resolve(r, at(delay + 30), null, d.session);
    assert.notEqual(first(d), '10:05');
  });
test('fluctuating delay does not shorten the train lease or reopen a completed 50s notice', () => {
  const r = route();
  let d = resolve(r, at(-220), positions(-220, 'here', 120));
  d = resolve(r, at(-190), positions(-190, 'here', 120), d.session);
  d = resolve(r, at(45), null, d.session);
  assert.equal(d.presentation?.kind, 'approaching');
  d = resolve(r, at(60), positions(60, 'here', 240), d.session);
  d = resolve(r, at(90), positions(90, 'here', 240), d.session);
  assert.equal(d.diagnostic?.delayMs, 240000);
  d = resolve(r, at(95), null, d.session);
  assert.equal(d.presentation?.kind, 'countdown');
  for (const [s, delay] of [
    [120, 60],
    [150, 60],
    [180, 0],
    [210, 120],
  ] as const) {
    d = resolve(r, at(s), positions(s, 'here', delay), d.session);
    assert.equal(d.presentation?.kind, 'countdown');
    assert.equal(d.diagnostic?.delayMs, 240000);
  }
});
test('failure, old snapshots, source replay, duplicate identity and future samples cannot establish new delay', () => {
  const r = route();
  let d = resolve(r, at(-220), positions(-220, 'here', 120));
  d = resolve(r, at(-190), positions(-190, 'here', 120), d.session);
  const deadline = d.diagnostic!.switchAt;
  for (const p of [
    null,
    positions(-220, 'here', 240),
    { ...positions(-190, 'here', 120), fetchedAt: at(-100).toISOString() },
  ]) {
    d = resolve(r, at(-100), p, d.session);
    assert.equal(d.diagnostic?.switchAt, deadline);
    assert.equal(d.diagnostic?.delayMs, 120000);
  }
  const dup = positions(-80, 'here', 240);
  dup.trains.push({ ...dup.trains[0] });
  d = resolve(r, at(-80), dup, d.session);
  assert.equal(d.diagnostic?.delayMs, 120000);
  const future = positions(0, 'here', 240);
  d = resolve(r, at(-60), future, d.session);
  assert.equal(d.diagnostic?.delayMs, 120000);
  assert.equal(resolve(r, at(-60), positions(-180, 'here', 240)).diagnostic?.delayMs, 0);
});
test('a single outgoing segment or null toStation cannot trigger early clearance; a subsequent downstream segment can', () => {
  for (const stage of ['outgoing', 'nullDownstream', 'here']) {
    const r = route();
    let d = resolve(r, at(-10), positions(-10, 'here'));
    d = resolve(r, at(5), positions(5, stage), d.session);
    assert.equal(first(d), '10:05');
  }
  const r = route();
  let d = resolve(r, at(-10), positions(-10, 'here'));
  d = resolve(r, at(5), positions(5, 'clear'), d.session);
  assert.equal(first(d), '10:06');
  d = resolve(r, at(6), positions(-10, 'here'), d.session);
  assert.equal(first(d), '10:06');
});
test('only a fresh adjacent incoming segment can start early, never a bare previous station', () => {
  assert.equal(resolve(route(), at(-90), positions(-90)).presentation?.kind, 'approaching');
  for (const stage of ['previous', 'far'])
    assert.equal(resolve(route(), at(-90), positions(-90, stage)).presentation?.kind, 'countdown');
  const r = route();
  let d = resolve(r, at(-90), positions(-90));
  d = resolve(r, at(-40), null, d.session);
  assert.equal(d.presentation?.kind, 'countdown');
  d = resolve(r, at(-20), positions(-20), d.session);
  assert.equal(d.presentation?.kind, 'countdown');
});
test('late delay observation after a retired train, schedule cloning, next-train data and clock rollback do not resurrect it', () => {
  const r = route();
  let d = resolve(r, at(30));
  assert.equal(first(d), '10:06');
  d = resolve(structuredClone(r), at(31), positions(31, 'here', 240), d.session);
  assert.equal(first(d), '10:06');
  d = resolve(r, at(-20), positions(-20, 'here'), d.session);
  assert.equal(first(d), '10:06');
  const next = positions(32);
  next.trains[0].id = id + '-next';
  d = resolve(r, at(32), next, d.session);
  assert.equal(first(d), '10:06');
});
test('delay retention and continuously refreshed positions both have a hard 15-minute cap', () => {
  const r = route([
    { time: '10:05', destination: '光が丘', type: '普通', trainId: id },
    { time: '10:30', destination: '都庁前', type: '普通' },
  ]);
  let d = resolve(r, at(-100), positions(-100, 'here', 600));
  d = resolve(r, at(-70), positions(-70, 'here', 600), d.session);
  assert.equal(d.diagnostic?.delayMs, 600000);
  assert.equal(d.diagnostic?.delayUntil, T + 630000);
  for (let s = 0; s < 900; s += 30) d = resolve(r, at(s), positions(s, 'here', 600), d.session);
  assert.equal(first(d), '10:05');
  d = resolve(r, at(900), positions(900, 'here', 600), d.session);
  assert.notEqual(first(d), '10:05');
  assert.equal(HYBRID_LIMITS.maxTrainHoldMs, 900000);
});
test('long tab sleep retires missed trains, and a return with an old sample cannot reopen them', () => {
  const r = route();
  let d = resolve(r, at(-75));
  d = resolve(r, at(200), null, d.session);
  assert.equal(first(d), '10:12');
  d = resolve(r, at(201), positions(-75), d.session);
  assert.equal(first(d), '10:12');
});

test('confirmation requires distinct nearby source timestamps, not cache replays or widely separated observations', () => {
  const r = route();
  let d = resolve(r, at(-240), positions(-240, 'here', 120));
  d = resolve(
    r,
    at(-210),
    { ...positions(-240, 'here', 120), fetchedAt: at(-210).toISOString() },
    d.session,
  );
  assert.equal(d.diagnostic?.delayMs, 0);
  d = resolve(r, at(-140), positions(-140, 'here', 120), d.session);
  assert.equal(d.diagnostic?.delayMs, 0);
  d = resolve(r, at(-110), positions(-110, 'here', 120), d.session);
  assert.equal(d.diagnostic?.delayMs, 120000);
});

test('same-timestamp conflicts and movement regression break delay confirmation', () => {
  const r = route();
  let d = resolve(r, at(-240), positions(-240, 'here', 120));
  d = resolve(
    r,
    at(-239),
    { ...positions(-240, 'incoming', 120), fetchedAt: at(-239).toISOString() },
    d.session,
  );
  d = resolve(r, at(-210), positions(-210, 'here', 120), d.session);
  assert.equal(d.diagnostic?.delayMs, 0);
  d = resolve(r, at(-180), positions(-180, 'incoming', 120), d.session);
  assert.equal(d.diagnostic?.delayMs, 0);
  d = resolve(r, at(-150), positions(-150, 'here', 120), d.session);
  assert.equal(d.diagnostic?.delayMs, 0);
  d = resolve(r, at(-120), positions(-120, 'here', 120), d.session);
  assert.equal(d.diagnostic?.delayMs, 120000);
});

test('ambiguous timetable identity, wrong line/direction and nonlocal or invalid delay are not corrections', () => {
  for (const invalid of ['duplicate', 'line', 'direction', 'far', 'negative', 'huge']) {
    const r = route();
    if (invalid === 'duplicate') {
      for (const entries of Object.values(r.schedules)) entries[1].trainId = id;
    }
    let session: HybridDepartureSession | undefined;
    for (const s of [-220, -190]) {
      const p = positions(
        s,
        invalid === 'far' ? 'far' : 'here',
        invalid === 'negative' ? -60 : invalid === 'huge' ? 601 : 120,
      );
      if (invalid === 'line') p.trains[0].railwayId = 'Mita';
      if (invalid === 'direction') p.trains[0].direction = 'InnerLoop';
      const d = resolve(r, at(s), p, session);
      session = d.session;
      assert.equal(d.diagnostic?.delayMs, 0, invalid);
    }
  }
});

test('a later train observation cannot overwrite the first train notice in a short headway', () => {
  const r = route();
  const p = positions(-80, 'incoming', 120);
  p.trains[0].id = id + '-next';
  const d = resolve(r, at(-80), p);
  assert.equal(first(d), '10:05');
  assert.equal(d.presentation?.kind, 'countdown');
  assert.equal(d.diagnostic?.delayMs, 0);
  const next = resolve(r, at(30), null, d.session);
  assert.equal(first(next), '10:06');
  assert.equal(next.presentation?.kind, 'approaching');
});

test('confirmed delay and position-only leases expire at their explicit boundary even after fetch failure', () => {
  const r = route();
  let d = resolve(r, at(-220), positions(-220, 'here', 60));
  d = resolve(r, at(-190), positions(-190, 'here', 60), d.session);
  assert.equal(d.diagnostic?.delayUntil, T + 110000);
  d = resolve(r, at(89), null, d.session);
  assert.equal(first(d), '10:05');
  d = resolve(r, at(90), null, d.session);
  // The 10:06 service reaches its own +30s boundary at the same instant.
  assert.equal(first(d), '10:12');
  let held = resolve(r, at(0), positions(0, 'here'));
  assert.equal(held.diagnostic?.switchAt, T + 180000);
  held = resolve(r, at(179), null, held.session);
  assert.equal(first(held), '10:05');
  held = resolve(r, at(180), null, held.session);
  assert.notEqual(first(held), '10:05');
});
test('legacy implementation retains its original +20 boundary while hybrid uses +30', () => {
  const r = route();
  assert.equal(first(resolve(r, at(20))), '10:05');
  const old = resolveLiveDepartures(r, at(20), null);
  assert.equal(old.board.kind === 'active' && old.board.departures[0].time, '10:06');
});

test('shadow diagnostics record turnover of the displayed first train, not expiration of a later candidate', () => {
  const r = route();
  let d = resolve(r, at(-220), positions(-220, 'here', 120));
  d = resolve(r, at(-190), positions(-190, 'here', 120), d.session);
  const active = d.session.active;
  d = resolve(r, at(90), null, d.session);
  assert.equal(first(d), '10:05');
  assert.equal(d.session.lastTurnover, undefined);
  d = resolve(r, at(150), null, d.session);
  assert.equal(first(d), '10:12');
  assert.deepEqual(d.session.lastTurnover, { train: active, at: T + 150000, reason: 'deadline' });
});
test('midnight, last train, next service day and Asakusa cutoff keep the existing calendars and safety gate', async () => {
  const r = route([
    { time: '23:59', destination: '光が丘', type: '普通' },
    { time: '00:05', destination: '光が丘', type: '普通' },
    { time: '05:00', destination: '光が丘', type: '普通' },
  ]);
  assert.equal(first(resolve(r, new Date('2026-11-16T00:00:00+09:00'))), '00:05');
  assert.equal(resolve(r, new Date('2026-11-16T00:05:30+09:00')).board.kind, 'ended');
  assert.equal(first(resolve(r, new Date('2026-11-16T04:00:00+09:00'))), '05:00');
  const asakusa = (await reviewedStation('gotanda')).routes[0];
  assert.notEqual(resolve(asakusa, new Date('2026-11-20T12:00:00+09:00')).board.kind, 'empty');
  assert.equal(resolve(asakusa, new Date('2026-11-21T04:00:00+09:00')).board.kind, 'empty');
});
