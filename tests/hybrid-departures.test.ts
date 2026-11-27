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

test('先読みで位置図を進めても、前駅から予測した接近案内は先読み前の時刻から表示する', () => {
  const r = route();
  const before = positions(-110, 'previous');
  const visit = approachingForecast(-110, 5).collected!.trains[0].model!;
  const projected: TrainPositionsSnapshot = {
    ...before,
    collected: {
      fetchedAt: before.fetchedAt,
      trains: [
        {
          ...before.trains[0],
          model: { ...visit, visit: 19, nextVisit: 19.5 },
          projection: {
            at: at(-110).getTime(),
            advanceMs: 50000,
            fromStation: before.trains[0].fromStation,
            toStation: r.sourceStationId!,
          },
        },
      ],
    },
  };
  let d = resolve(r, at(-96), projected);
  assert.equal(d.presentation?.kind, 'countdown');
  d = resolve(r, at(-95), projected, d.session);
  assert.equal(d.presentation?.kind, 'countdown');
  assert.equal(d.estimatedDiagram?.segment, 'second');
  assert.equal(resolve(r, at(-90), null, d.session).presentation?.kind, 'countdown');
  const verified = { ...projected, ...positions(-90, 'incoming') };
  assert.equal(resolve(r, at(-90), verified, d.session).presentation?.kind, 'approaching');
  d = resolve(r, at(-51), projected, d.session);
  assert.equal(d.presentation?.kind, 'countdown');
  d = resolve(r, at(-50), projected, d.session);
  assert.equal(d.presentation?.kind, 'approaching');
  const later = structuredClone(projected);
  later.collected!.trains[0].projection!.at = at(-30).getTime();
  d = resolve(r, at(-49), later, d.session);
  assert.equal(d.presentation?.kind, 'approaching');

  const incoming = approachingForecast(-75, 5);
  incoming.collected!.trains[0].projection!.advanceMs = 50000;
  d = resolve(r, at(-46), incoming, d.session);
  assert.equal(d.presentation?.kind, 'approaching');
  d = resolve(r, at(-45), incoming, d.session);
  assert.equal(d.presentation?.kind, 'approaching');
  assert.equal(d.estimatedDiagram?.stage, 'here');
  assert.equal(first(d), '10:05');
  const stopped: TrainPositionsSnapshot = forecast(-35, 60);
  stopped.collected!.trains[0].projection!.advanceMs = 50000;
  d = resolve(r, at(-35), stopped, d.session);
  assert.equal(d.presentation?.kind, 'countdown');
  d = resolve(r, at(9), stopped, d.session);
  assert.equal(first(d), '10:05');
  d = resolve(r, at(10), stopped, d.session);
  assert.equal(first(d), '10:06');
  assert.equal(d.session.lastTurnover?.reason, 'estimate');
});

test('推定位置図が当駅へ進んでも、到着観測までは進入中の案内を続ける', () => {
  const r = route();
  let d = resolve(r, at(-65), approachingForecast(-65, 20));
  assert.equal(d.presentation?.kind, 'approaching');
  d = resolve(r, at(-25), approachingForecast(-25, 20), d.session);
  assert.equal(d.presentation?.kind, 'approaching');
  const approaching = approachingForecast(0, 20);
  d = resolve(r, at(9), approaching, d.session);
  assert.equal(d.presentation?.kind, 'approaching');
  d = resolve(r, at(10), approaching, d.session);
  assert.equal(d.diagnostic?.approachEnd, T + 80000);
  assert.equal(d.estimatedDiagram?.segment, 'second');
  assert.equal(d.presentation?.kind, 'approaching');
  assert.equal(
    resolve(r, at(10), approaching, undefined, true, 0).presentation?.kind,
    'approaching',
  );
  assert.equal(resolve(r, at(20), approaching, undefined, true, 0).presentation?.kind, 'countdown');
  d = resolve(r, at(20), approaching, d.session);
  assert.equal(d.estimatedDiagram?.stage, 'here');
  assert.equal(d.presentation?.kind, 'approaching');
  assert.equal(first(d), '10:05');
  d = resolve(r, at(21), positions(21, 'here'), d.session);
  assert.equal(d.presentation?.kind, 'countdown');
  assert.equal(resolve(r, at(22), approaching, d.session).presentation?.kind, 'countdown');
});

test('SSEが進入区間を示す間は点灯し、欠測時だけ最新の予測期限を使う', () => {
  const r = route();
  const data = approachingForecast(-30, -5);
  const p = data.collected!.trains[0];
  const estimate = {
    id,
    runId: p.model!.runId,
    visit: p.model!.visit,
    fromStation: p.fromStation,
    toStation: p.toStation,
    delaySeconds: 20,
  };
  data.serverEstimates = { validUntil: at(20).getTime(), trains: [estimate] };
  let d = resolve(r, at(4), data);
  assert.equal(d.presentation?.kind, 'approaching');
  d = resolve(r, at(5), data, d.session);
  assert.equal(d.presentation?.kind, 'approaching');
  assert.equal(d.diagnostic?.approachEnd, T + 60000);
  assert.equal(d.estimatedDiagram?.segment, 'second');
  assert.equal(first(d), '10:05');
  assert.equal(resolve(r, at(6), null, d.session).presentation?.kind, 'approaching');
  const later = {
    ...data,
    serverEstimates: { ...data.serverEstimates, trains: [{ ...estimate, delaySeconds: 40 }] },
  };
  d = resolve(r, at(6), later, d.session);
  assert.equal(d.presentation?.kind, 'approaching');
  assert.equal(resolve(r, at(7), null, d.session).presentation?.kind, 'approaching');
});

test('到着見込みを過ぎた古い接近は解除し、新しい進入観測でのみ表示を戻す', () => {
  const r = route();
  const incoming = approachingForecast(-80, -80);
  const p = incoming.collected!.trains[0];
  p.projection!.advanceMs = 50000;
  const estimate = {
    id,
    runId: p.model!.runId,
    visit: p.model!.visit,
    fromStation: p.fromStation,
    toStation: p.toStation,
    delaySeconds: 0,
  };
  const heartbeat = (seconds: number) => ({
    ...incoming,
    serverEstimates: { validUntil: at(seconds + 20).getTime(), trains: [estimate] },
  });

  let d = resolve(r, at(-80), heartbeat(-80));
  assert.equal(d.presentation?.kind, 'approaching');
  d = resolve(r, at(-50), heartbeat(-50), d.session);
  assert.equal(d.presentation?.kind, 'approaching');
  d = resolve(r, at(-21), heartbeat(-21), d.session);
  assert.equal(d.presentation?.kind, 'approaching');
  const recent = approachingForecast(-21, -80);
  recent.collected!.trains[0].projection!.advanceMs = 50000;
  const renewed = { ...heartbeat(-20), ...recent };
  assert.equal(resolve(r, at(-20), renewed, d.session).presentation?.kind, 'approaching');
  d = resolve(r, at(-20), heartbeat(-20), d.session);
  assert.equal(d.presentation?.kind, 'countdown');
  assert.equal(d.estimatedDiagram?.segment, 'second');
  assert.equal(first(d), '10:05');
  d = resolve(r, at(-19), heartbeat(-19), d.session);
  assert.equal(d.presentation?.kind, 'countdown');
  d = resolve(r, at(-18), null, d.session);
  assert.equal(d.presentation?.kind, 'countdown');
  d = resolve(r, at(-17), heartbeat(-17), d.session);
  assert.equal(d.presentation?.kind, 'countdown');

  const collected = {
    ...heartbeat(-16),
    collected: approachingForecast(-16, -80).collected,
  };
  assert.equal(resolve(r, at(-16), collected, d.session).presentation?.kind, 'approaching');
  d = resolve(r, at(-15), { ...heartbeat(-15), ...positions(-15, 'incoming') }, d.session);
  assert.equal(d.presentation?.kind, 'approaching');
  d = resolve(r, at(-12), { ...heartbeat(-12), ...positions(-12, 'here') }, d.session);
  assert.equal(d.presentation?.kind, 'countdown');
  d = resolve(r, at(-11), heartbeat(-11), d.session);
  assert.equal(d.presentation?.kind, 'countdown');
  const clear = positions(17, 'clear');
  d = resolve(r, at(17), clear, d.session);
  assert.equal(first(d), '10:05');
  assert.equal(first(resolve(r, at(18), clear, d.session)), '10:06');
});

test('遅着のSSE推定は端末予測より優先し、失効しても開始済みの案内を維持する', () => {
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
  assert.equal(resolve(r, at(20), data, incoming.session).presentation?.kind, 'approaching');
  const http = { ...data, serverEstimates: undefined };
  const here = resolve(r, at(5), http, incoming.session);
  assert.equal(here.estimatedDiagram?.stage, 'here');
  assert.equal(here.presentation?.kind, 'approaching');
});

test('到着予測のないSSEの進入区間は40秒を越えても案内し、生存通知だけでは欠測時の期限を延ばさない', () => {
  const r = route();
  const data = approachingForecast(-80, -90);
  const p = data.collected!.trains[0];
  const estimate = {
    id,
    runId: p.model!.runId,
    visit: 19.5,
    fromStation: p.fromStation,
    toStation: p.toStation,
    delaySeconds: 60,
    evidence: {
      firstDirect: at(-110).getTime(),
      firstCollected: at(-110).getTime(),
      confirmed: true,
      at: at(-80).getTime(),
      lag: 60_000,
      stalled: true,
      phase: 19.5,
    },
  };
  let session: HybridDepartureSession | undefined;
  for (let seconds = -80; seconds <= -25; seconds += 5) {
    const frame = {
      ...data,
      serverEstimates: { validUntil: at(seconds + 20).getTime(), trains: [estimate] },
    };
    const d = resolve(r, at(seconds), frame, session);
    assert.equal(d.estimatedDiagram?.segment, 'second');
    assert.equal(d.presentation?.kind, 'approaching');
    session = d.session;
  }
  const missing = resolve(r, at(-24), null, session);
  assert.equal(missing.presentation?.kind, 'countdown');
  assert.equal(missing.estimatedDiagram, undefined);
  const arrived = resolve(r, at(-23), forecast(-23, 5), missing.session);
  assert.equal(arrived.estimatedDiagram?.stage, 'here');
  assert.equal(arrived.presentation?.kind, 'countdown');
  const back = approachingForecast(-22, 30);
  back.serverEstimates = { validUntil: at(0).getTime(), trains: [estimate] };
  const regressed = resolve(r, at(-22), back, arrived.session);
  assert.equal(regressed.presentation?.kind, 'countdown');
  assert.equal(regressed.estimatedDiagram, undefined);
});

test('時刻表で案内が始まっていても、推定位置が進入区間より手前なら待機する', () => {
  const r = route();
  const initial = resolve(r, at(-75));
  assert.equal(initial.presentation?.kind, 'approaching');
  const data = approachingForecast(-70, 30);
  const upstream = data.collected!.trains[0];
  Object.assign(upstream, positions(-70, 'far').trains[0]);
  upstream.model!.visit = 18.5;
  const before = resolve(r, at(-70), data, initial.session);
  assert.equal(before.estimatedDiagram?.segment, 'first');
  assert.equal(before.presentation?.kind, 'countdown');
  assert.equal(resolve(r, at(-69), null, before.session).presentation?.kind, 'countdown');
  const approaching = resolve(r, at(-45), approachingForecast(-45, 10), before.session);
  assert.equal(approaching.presentation?.kind, 'approaching');
  assert.equal(approaching.estimatedDiagram?.segment, 'second');
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

test('時刻表だけで案内を終えた後も、同じ便が実際に進入区間に入ったら案内する', () => {
  const r = route();
  let d = resolve(r, at(-60), null);
  assert.equal(d.presentation?.kind, 'approaching');
  d = resolve(r, at(-35), null, d.session);
  assert.equal(d.presentation?.kind, 'countdown');
  d = resolve(r, at(-30), approachingForecast(-30, 20), d.session);
  assert.equal(first(d), '10:05');
  assert.equal(d.estimatedDiagram?.segment, 'second');
  assert.equal(d.presentation?.kind, 'approaching');
  assert.equal(d.diagnostic?.approachEnd, at(60).getTime());
  d = resolve(r, at(0), forecast(0, 0), d.session);
  assert.equal(first(d), '10:06');
  assert.equal(d.presentation?.kind, 'approaching');
});

test('到着予測が欠けても同じ終了期限を使い、古い進入観測では再表示しない', () => {
  const r = route();
  let d = resolve(r, at(0), approachingForecast(0, 20));
  assert.equal(d.presentation?.kind, 'approaching');
  d = resolve(r, at(1), null, d.session);
  assert.equal(d.presentation?.kind, 'approaching');
  const refreshed = approachingForecast(2, 20);
  d = resolve(r, at(2), refreshed, d.session);
  assert.equal(first(d), '10:05');
  assert.equal(d.estimatedDiagram?.segment, 'second');
  assert.equal(d.presentation?.kind, 'approaching');
  d = resolve(r, at(79), null, d.session);
  assert.equal(d.presentation?.kind, 'approaching');
  d = resolve(r, at(80), null, d.session);
  assert.equal(first(d), '10:05');
  assert.equal(d.presentation?.kind, 'countdown');
  d = resolve(r, at(81), refreshed, d.session);
  assert.equal(d.estimatedDiagram?.stage, 'here');
  assert.equal(d.presentation?.kind, 'countdown');
  d = resolve(r, at(82), forecast(82, 110), d.session);
  assert.equal(first(d), '10:05');
  assert.equal(d.presentation?.kind, 'countdown');
  d = resolve(r, at(83), approachingForecast(83, 90), d.session);
  assert.equal(d.presentation?.kind, 'countdown');
});

test('停車の観測を飛ばして当駅発の区間に移ったら、先発を保ったまま案内を終了する', () => {
  const r = route();
  let d = resolve(r, at(-75), positions(-75, 'incoming'));
  assert.equal(d.presentation?.kind, 'approaching');
  d = resolve(r, at(-55), positions(-55, 'outgoing'), d.session);
  assert.equal(first(d), '10:05');
  assert.equal(d.presentation?.kind, 'countdown');
  assert.equal(resolve(r, at(-54), null, d.session).presentation?.kind, 'countdown');
});

test('欠測で接近案内を解除したあとは同じ進入観測の再配信で点灯しない', () => {
  const r = route();
  const incoming = positions(-75);
  let d = resolve(r, at(-75), incoming);
  assert.equal(d.presentation?.kind, 'approaching');
  d = resolve(r, at(-35), null, d.session);
  assert.equal(d.presentation?.kind, 'countdown');
  d = resolve(r, at(-34), incoming, d.session);
  assert.equal(d.presentation?.kind, 'countdown');
  d = resolve(r, at(-33), positions(-33), d.session);
  assert.equal(d.presentation?.kind, 'approaching');
});

test('SSEの進入推定より新しい当駅の直接観測で、位置図と接近案内を揃える', () => {
  const r = route();
  const data = approachingForecast(0, 60);
  const p = data.collected!.trains[0];
  data.serverEstimates = {
    validUntil: at(50).getTime(),
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
  let d = resolve(r, at(10), data);
  assert.equal(d.presentation?.kind, 'approaching');
  const arrived = { ...data, ...positions(12, 'here') };
  d = resolve(r, at(12), arrived, d.session);
  assert.equal(first(d), '10:05');
  assert.equal(d.estimatedDiagram?.stage, 'here');
  assert.ok(!d.estimatedDiagram?.estimated);
  assert.equal(d.presentation?.kind, 'countdown');
  // A heartbeat can renew the server estimate without a new source observation.
  d = resolve(r, at(32), { ...arrived, trains: [] }, d.session);
  assert.equal(first(d), '10:05');
  assert.equal(d.presentation?.kind, 'countdown');
  d = resolve(r, at(42), forecast(42, 42), d.session);
  assert.equal(first(d), '10:06');
});

test('収集の進入観測と同じ更新時刻の直接観測で当駅に到着したら接近案内を解除する', () => {
  const r = route();
  const incoming = resolve(r, at(-5), approachingForecast(-5, 20));
  assert.equal(incoming.presentation?.kind, 'approaching');
  const arrived = { ...approachingForecast(0, 20), ...positions(0, 'here') };
  const d = resolve(r, at(0), arrived, incoming.session);
  assert.equal(d.presentation?.kind, 'countdown');
  assert.equal(d.estimatedDiagram?.stage, 'here');
  assert.ok(!d.estimatedDiagram?.estimated);
});

test('直接観測が欠落または古いときも、推定のない収集側の当駅観測で接近案内を解除する', () => {
  const r = route();
  const incoming = approachingForecast(-20, 30);
  const started = resolve(r, at(-20), incoming);
  assert.equal(started.presentation?.kind, 'approaching');

  const arrived = positions(0, 'here');
  for (const trains of [[], incoming.trains]) {
    const collectedOnly = { fetchedAt: arrived.fetchedAt, trains, collected: arrived };
    const stopped = resolve(r, at(0), collectedOnly, started.session);
    assert.equal(first(stopped), '10:05');
    assert.equal(stopped.presentation?.kind, 'countdown');
    assert.equal(stopped.estimatedDiagram?.stage, 'here');
    assert.equal(stopped.diagnostic?.sourceAt, at(0).getTime());

    const repeated = resolve(r, at(1), collectedOnly, stopped.session);
    assert.equal(repeated.presentation?.kind, 'countdown');
    assert.equal(repeated.estimatedDiagram?.stage, 'here');
  }

  const direct = positions(0);
  const conflicting = resolve(r, at(0), { ...direct, collected: arrived }, started.session);
  assert.equal(conflicting.presentation?.kind, 'approaching');
  assert.equal(conflicting.estimatedDiagram?.segment, 'second');

  const withoutDirect = { ...arrived, trains: [], collected: arrived };
  const repeatedConflict = resolve(r, at(1), withoutDirect, conflicting.session);
  assert.equal(repeatedConflict.presentation?.kind, 'approaching');
  assert.equal(
    repeatedConflict.session.trains.get(repeatedConflict.session.active!)?.conflicted,
    false,
  );
});

test('前駅からの接近予測を解除した便は、同じ観測を元に再点灯しない', () => {
  const r = route();
  const previous = positions(-70, 'previous');
  const p = previous.trains[0];
  const model = {
    runId: '2026-11-15/' + id + '/1',
    visit: 19,
    nextVisit: 19.5,
    lead: 60000,
    dwellUntil: T,
  };
  const projection = {
    at: at(-125).getTime(),
    fromStation: p.fromStation,
    toStation: positions(-70).trains[0].toStation,
  };
  const incoming = {
    ...previous,
    collected: { fetchedAt: previous.fetchedAt, trains: [{ ...p, model, projection }] },
  };
  const newer = { ...incoming, ...positions(-35, 'previous') };
  const caughtUp = {
    ...newer,
    collected: {
      fetchedAt: newer.fetchedAt,
      trains: [{ ...newer.trains[0], model, projection }],
    },
  };
  assert.equal(resolve(r, at(-35), newer).presentation?.kind, 'countdown');
  const beforeDeparture = positions(-66, 'previous');
  const earlierObservation = {
    ...beforeDeparture,
    collected: {
      fetchedAt: beforeDeparture.fetchedAt,
      trains: [{ ...beforeDeparture.trains[0], model, projection }],
    },
  };
  assert.equal(resolve(r, at(-64), earlierObservation).presentation?.kind, 'approaching');
  assert.equal(resolve(r, at(-35), caughtUp).presentation?.kind, 'countdown');

  let d = resolve(r, at(-64), incoming);
  assert.equal(d.presentation?.kind, 'approaching');
  const equallyFresh = resolve(r, at(-35), caughtUp, d.session);
  assert.equal(equallyFresh.presentation?.kind, 'countdown');
  assert.equal(resolve(r, at(-34), caughtUp, equallyFresh.session).presentation?.kind, 'countdown');
  const stalled = {
    ...caughtUp,
    serverEstimates: {
      validUntil: at(-15).getTime(),
      trains: [
        {
          ...projection,
          id,
          runId: model.runId,
          visit: model.nextVisit,
          delaySeconds: 120,
          evidence: {
            firstDirect: at(-70).getTime(),
            firstCollected: at(-70).getTime(),
            confirmed: true,
            at: at(-35).getTime(),
            lag: 120000,
            stalled: true,
            phase: model.visit,
          },
        },
      ],
    },
  };
  const stopped = resolve(r, at(-35), stalled, d.session);
  assert.equal(stopped.presentation?.kind, 'countdown');
  assert.equal(stopped.estimatedDiagram?.description, '前駅');

  d = resolve(r, at(-35), newer, d.session);
  assert.equal(d.presentation?.kind, 'countdown');
  assert.equal(d.estimatedDiagram, undefined);

  d = resolve(r, at(-30), caughtUp, d.session);
  assert.equal(d.presentation?.kind, 'countdown');
  assert.equal(d.estimatedDiagram, undefined);

  d = resolve(r, at(0), { ...caughtUp, ...positions(0, 'previous') }, d.session);
  assert.equal(d.presentation?.kind, 'countdown');
  assert.equal(d.estimatedDiagram?.description, '前駅');
  assert.ok(!d.estimatedDiagram?.estimated);

  d = resolve(r, at(1), { ...caughtUp, ...positions(1) }, d.session);
  assert.equal(d.presentation?.kind, 'approaching');
  assert.equal(d.estimatedDiagram?.segment, 'second');
  assert.ok(!d.estimatedDiagram?.estimated);
});

test('収集側の推定が欠けても進入観測の有効期間は先発を保持し、同じ応答で延長しない', () => {
  const r = route();
  const data = { ...positions(5), collected: null };
  let d = resolve(r, at(15), data);
  d = resolve(r, at(30), data, d.session);
  assert.equal(first(d), '10:05');
  assert.equal(d.presentation?.kind, 'approaching');
  assert.equal(d.estimatedDiagram?.segment, 'second');
  const missing = resolve(r, at(94), null, d.session);
  assert.equal(first(missing), '10:05');
  assert.equal(first(resolve(r, at(95), null, missing.session)), '10:12');
  d = resolve(r, at(42), forecast(42, 72), d.session);
  assert.equal(first(d), '10:05');
  assert.equal(d.presentation?.kind, 'countdown');
  assert.equal(d.session.lastTurnover, undefined);
  assert.equal(first(resolve(r, at(72), forecast(72, 72), d.session)), '10:06');
});

test('同じ進入区間を更新し続けても90秒で接近を解除し、到着を確定せず先発を残す', () => {
  for (const snapshot of [(time: number) => approachingForecast(time, 150), positions]) {
    const r = route();
    let d = resolve(r, at(-75), snapshot(-75));
    for (const second of [-45, -15, 14]) {
      d = resolve(r, at(second), snapshot(second), d.session);
      assert.equal(d.presentation?.kind, 'approaching');
    }
    d = resolve(r, at(15), snapshot(14), d.session);
    assert.equal(d.presentation?.kind, 'countdown');
    assert.equal(first(d), '10:05');
    const active = d.session.active!;
    assert.equal(d.session.trains.get(active)?.noticeTimedOutAt, at(15).getTime());
    assert.equal(d.session.trains.get(active)?.approachEndedAt, undefined);
    d = resolve(r, at(16), snapshot(16), d.session);
    assert.equal(d.presentation?.kind, 'countdown');
    assert.equal(first(d), '10:05');
    d = resolve(r, at(17), positions(17, 'here'), d.session);
    assert.equal(d.session.trains.get(active)?.approachEndedAt, at(17).getTime());
  }
});

test('古い発車推定と新しい進入観測が重なったときは、案内と繰り上げの両方に進入観測を使う', () => {
  const r = route();
  const old = forecast(0, 5);
  const direct = positions(35);
  const d = resolve(r, at(36), { ...old, ...direct });
  assert.equal(first(d), '10:05');
  assert.equal(d.presentation?.kind, 'approaching');
  assert.equal(d.estimatedDiagram?.segment, 'second');
  assert.equal(d.diagnostic?.switchAt, at(125).getTime());
});

test('GTFS便は進入区間の新鮮な観測を優先し、欠測では期限を延長しない', () => {
  const r = route([
    {
      time: '10:05',
      destination: '光が丘',
      type: '普通',
      trainId: id,
      gtfs: { stopMask: (1 << 18) | (1 << 19), destinationId: 'Hikarigaoka' },
    },
  ]);
  const tracked = (seconds: number, stage: string) => {
    const snapshot = positions(seconds, stage);
    snapshot.trains[0].destinationStation = 'odpt.Station:Toei.Oedo.Hikarigaoka';
    return snapshot;
  };
  let d = resolve(r, at(-15), tracked(-15, 'incoming'));
  assert.equal(d.presentation?.kind, 'approaching');
  d = resolve(r, at(-14), null, d.session);
  assert.equal(d.presentation?.kind, 'approaching');
  d = resolve(r, at(-13), tracked(-13, 'incoming'), d.session);
  assert.equal(first(d), '10:05');
  assert.equal(d.diagnostic?.sourceAt, at(-13).getTime());
  assert.equal(d.presentation?.kind, 'approaching');
  const stillIncoming = resolve(r, at(24), tracked(24, 'incoming'), d.session);
  assert.equal(stillIncoming.presentation?.kind, 'approaching');
  const incoming = resolve(r, at(25), tracked(25, 'incoming'), stillIncoming.session);
  assert.equal(incoming.presentation?.kind, 'approaching');
  assert.equal(incoming.diagnostic?.sourceAt, at(25).getTime());
  assert.equal(first(incoming), '10:05');
  const missing = resolve(r, at(26), null, incoming.session);
  assert.equal(missing.presentation?.kind, 'expired');
  assert.equal(missing.position, undefined);
  d = resolve(r, at(-12), tracked(-12, 'here'), d.session);
  assert.equal(first(d), '10:05');
  assert.equal(d.presentation?.kind, 'countdown');
});

test('GTFSの観測が進入から当駅発の区間に飛んでも、定刻30秒後に即座に次発へ進めない', () => {
  const r = route();
  const train = r.schedules.holiday[0];
  train.gtfs = {
    stopMask: (1 << 18) | (1 << 19) | (1 << 20) | (1 << 21),
    destinationId: 'Hikarigaoka',
  };
  const tracked = (seconds: number, stage: string) => {
    const data = positions(seconds, stage);
    data.trains[0].destinationStation = 'odpt.Station:Toei.Oedo.Hikarigaoka';
    return data;
  };
  const incoming = tracked(-5, 'incoming');
  let d = resolve(r, at(24), incoming);
  assert.equal(d.presentation?.kind, 'approaching');
  const outbound = tracked(25, 'outgoing');
  d = resolve(r, at(25), outbound, d.session);
  assert.equal(d.presentation?.kind, 'expired');
  assert.equal(d.diagnostic?.sourceAt, at(25).getTime());
  for (const second of [30, 54]) {
    d = resolve(r, at(second), outbound, d.session);
    assert.equal(first(d), '10:05');
  }
  assert.equal(first(resolve(r, at(55), null, d.session)), '10:06');
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

test('三田線の同じ列車を隣接駅で照合し、SSE・HTTPの先読みで定刻前に先発を消さない', () => {
  const load = (station: string) =>
    (
      JSON.parse(readFileSync('public/data/' + station + '.json', 'utf8')) as StationData
    ).routes.find((r) => r.id === 'Toei.Mita.Northbound')!;
  const upstream = load('itabashikuyakushomae');
  const downstream = load('itabashihoncho');
  const trainId = 'odpt.Train:Toei.Mita.1177T';
  const departure = upstream.schedules.weekday.find((t) => t.trainId === trainId)!;
  const nextStop = downstream.schedules.weekday.find((t) => t.trainId === trainId)!;
  const due = Date.parse('2026-11-20T' + departure.time + ':00+09:00');
  const before = new Date(due - 1);
  const prefix = 'odpt.Station:Toei.Mita.';
  const p = {
    id: trainId,
    railwayId: 'Mita' as const,
    direction: 'Northbound',
    fromStation: prefix + 'ItabashiKuyakushomae',
    toStation: null,
    updatedAt: before.toISOString(),
    validUntil: new Date(due + 90000).toISOString(),
    model: {
      runId: '2026-11-20/' + trainId + '/1',
      visit: 17,
      nextVisit: 17.5,
      lead: 60000 as const,
      dwellUntil: due,
    },
    projection: {
      at: due - 10000,
      fromStation: prefix + 'ItabashiKuyakushomae',
      toStation: prefix + 'Itabashihoncho',
    },
  };
  const data = {
    fetchedAt: p.updatedAt,
    trains: [p],
    collected: { fetchedAt: p.updatedAt, trains: [p] },
  };
  const outgoing = {
    id: p.id,
    runId: p.model.runId,
    visit: p.model.nextVisit,
    fromStation: p.fromStation,
    toStation: p.projection.toStation,
    delaySeconds: 0,
  };
  const server = { ...data, serverEstimates: { validUntil: due + 15000, trains: [outgoing] } };
  for (const positions of [data, server]) {
    const early = resolve(upstream, before, positions);
    assert.equal(first(early), departure.time);
    const onTime = resolve(upstream, new Date(due), positions, early.session);
    assert.equal(onTime.session.lastTurnover?.reason, 'estimate');
    const adjacent = resolve(downstream, new Date(due), positions);
    assert.equal(first(adjacent), nextStop.time);
    assert.equal(adjacent.estimatedDiagram?.segment, 'second');
  }
});

function withServerEstimate(data: TrainPositionsSnapshot, visit: number): TrainPositionsSnapshot {
  const p = data.collected!.trains[0];
  const position = visit === p.model!.visit ? p : p.projection!;
  return {
    ...data,
    serverEstimates: {
      validUntil: at(55).getTime(),
      trains: [
        {
          id,
          runId: p.model!.runId,
          visit,
          fromStation: position.fromStation,
          toStation: position.toStation,
          delaySeconds: 0,
        },
      ],
    },
  };
}

test('HTTPでの先発切替後にSSEが復帰しても、同じか古い観測では先発・次発を戻さない', () => {
  const r = route();
  const data = forecast(30, 35);
  const stopped = resolve(r, at(34), data);
  assert.equal(first(stopped), '10:05');
  const turned = resolve(r, at(35), data, stopped.session);
  assert.equal(first(turned), '10:06');

  let d = turned;
  for (const [now, source] of [
    [36, 30],
    [37, 29],
  ]) {
    const old = forecast(source, 50);
    const publishedAt = at(now).toISOString();
    const resumed = withServerEstimate(
      { ...old, fetchedAt: publishedAt, collected: { ...old.collected, fetchedAt: publishedAt } },
      20,
    );
    assert.equal(first(resolve(r, at(now), resumed)), '10:05');
    d = resolve(r, at(now), resumed, d.session);
    assert.equal(first(d), '10:06');
    assert.deepEqual(d.board.kind === 'active' && d.board.departures.map((t) => t.time), [
      '10:06',
      '10:12',
    ]);
  }

  const newer = withServerEstimate(forecast(38, 50), 20);
  const recovered = resolve(r, at(38), newer, d.session);
  assert.equal(first(recovered), '10:05');
  assert.equal(recovered.estimatedDiagram?.stage, 'here');
  assert.equal(first(resolve(r, at(55), newer, d.session)), '10:06');
});

test('元観測が発車を示して先発が切り替わった列車は、後から当駅の推定が届いても復元しない', () => {
  const r = route();
  const outbound = positions(35, 'outgoing');
  const raw = outbound.trains[0];
  const sample = forecast(35, 65).collected.trains[0];
  const collected = {
    fetchedAt: outbound.fetchedAt,
    trains: [
      {
        ...sample,
        ...raw,
        model: { ...sample.model, visit: 20.5, nextVisit: 21 },
        projection: { at: at(65).getTime(), fromStation: raw.toStation!, toStation: null },
      },
    ],
  };
  const observed = { ...outbound, collected };
  for (const source of [observed, withServerEstimate(observed, 20.5)]) {
    const stopped = resolve(r, at(34), forecast(34, 40));
    const turned = resolve(r, at(35), source, stopped.session);
    assert.equal(first(turned), '10:06');
    assert.equal(turned.session.lastTurnover?.at, at(35).getTime());
    const regressed = withServerEstimate(forecast(36, 50), 20);
    assert.equal(first(resolve(r, at(36), regressed, turned.session)), '10:06');
  }
});

test('SSEで切り替えた先発は同じ元観測で復元せず、新しい当駅の観測では復元できる', () => {
  const r = route();
  const before = resolve(r, at(34), withServerEstimate(forecast(34, 40), 20));
  const turned = resolve(r, at(35), withServerEstimate(forecast(35, 35), 20.5), before.session);
  assert.equal(first(turned), '10:06');
  const repeated = resolve(r, at(36), withServerEstimate(forecast(35, 46), 20), turned.session);
  assert.equal(first(repeated), '10:06');
  const fresherDirect = { ...withServerEstimate(forecast(35, 35), 20.5), ...positions(37, 'here') };
  assert.equal(first(resolve(r, at(37), fresherDirect, repeated.session)), '10:05');
  const fresh = resolve(r, at(37), withServerEstimate(forecast(37, 46), 20), repeated.session);
  assert.equal(first(fresh), '10:05');
  assert.equal(fresh.estimatedDiagram?.stage, 'here');
  const projectedAgain = resolve(
    r,
    at(40),
    withServerEstimate(forecast(40, 40), 20.5),
    fresh.session,
  );
  assert.equal(first(projectedAgain), '10:05');
  assert.equal(projectedAgain.estimatedDiagram?.stage, 'here');
  assert.ok(!projectedAgain.estimatedDiagram?.estimated);
  const departed = { ...positions(65, 'clear'), collected: null };
  assert.equal(first(resolve(r, at(65), departed, projectedAgain.session)), '10:06');
});

test('時刻表で先発が切り替わった後にSSEが先発を復元すると、その便の接近案内も戻る', () => {
  const r = route();
  const started = resolve(r, at(-70));
  const retired = resolve(r, at(31), null, started.session);
  assert.equal(first(retired), '10:06');
  const data = approachingForecast(35, 65);
  const p = data.collected!.trains[0];
  data.serverEstimates = {
    validUntil: at(55).getTime(),
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
  const recovered = resolve(r, at(36), data, retired.session);
  assert.equal(first(recovered), '10:05');
  assert.equal(recovered.estimatedDiagram?.segment, 'second');
  assert.equal(recovered.presentation?.kind, 'approaching');
});

const missedId = id + '-next';
const laterId = id + '-later';
function nextWithoutObservation() {
  const r = route(
    ['10:05', '10:06', '10:07', '10:30'].map((time, i) => ({
      time,
      destination: '光が丘',
      type: '普通',
      trainId: [id, missedId, laterId, undefined][i],
    })),
  );
  const shown = resolve(r, at(94), positions(94));
  assert.equal(shown.board.kind, 'active');
  assert.deepEqual(
    shown.board.departures.map((t) => t.trainId),
    [id, missedId],
  );
  const cleared = positions(95, 'clear');
  const holding = resolve(r, at(95), cleared, shown.session);
  assert.equal(first(holding), '10:05');
  const skipped = resolve(r, at(125), cleared, holding.session);
  assert.equal(first(skipped), '10:07');
  return { r, skipped };
}

function lateNext(seconds: number, stage = 'incoming') {
  const data = positions(seconds, stage);
  data.trains[0].id = missedId;
  return data;
}

test('表示していた次発を欠測で飛ばした場合は、新しい直接観測だけでも先発と接近案内を戻す', () => {
  const { r, skipped } = nextWithoutObservation();
  const raw = lateNext(126);
  const sse = {
    ...raw,
    collected: { fetchedAt: raw.fetchedAt, trains: raw.trains },
    serverEstimates: { validUntil: at(146).getTime(), trains: [] },
  };
  for (const data of [raw, sse]) {
    let d = resolve(r, at(126), data, skipped.session);
    assert.equal(first(d), '10:06');
    assert.equal(d.presentation?.kind, 'approaching');
    assert.equal(d.position?.segment, 'second');

    d = resolve(r, at(130), lateNext(130, 'here'), d.session);
    assert.equal(first(d), '10:06');
    assert.equal(d.presentation?.kind, 'countdown');
    assert.equal(d.position?.stage, 'here');

    const clearing = lateNext(160, 'clear');
    clearing.trains.push({ ...positions(160).trains[0], id: laterId });
    d = resolve(r, at(160), clearing, d.session);
    assert.equal(first(d), '10:07');
    assert.equal(first(resolve(r, at(161), lateNext(161, 'here'), d.session)), '10:07');
  }
});

test('飛ばした次発の復元には、切替後の時刻を持つ一意な進入または在駅の観測が必要', () => {
  const { r, skipped } = nextWithoutObservation();
  const original = lateNext(126);
  const position = original.trains[0];
  const variants = [
    lateNext(126, 'previous'),
    lateNext(126, 'outgoing'),
    { ...lateNext(125), fetchedAt: original.fetchedAt },
    { ...original, trains: [{ ...position, validUntil: at(126).toISOString() }] },
    { ...original, trains: [{ ...position, updatedAt: at(128).toISOString() }] },
    { ...original, trains: [{ ...position, direction: 'InnerLoop' }] },
    { ...original, trains: [{ ...position, id: laterId }] },
    { ...original, trains: [position, { ...position }] },
  ];
  for (const data of variants)
    assert.equal(first(resolve(r, at(126), data, skipped.session)), '10:07');
  const openedAfterSkip = resolve(r, at(125));
  assert.equal(first(resolve(r, at(126), original, openedAfterSkip.session)), '10:07');
  assert.notEqual(first(resolve(r, at(960), lateNext(960, 'here'), skipped.session)), '10:06');
});

test('次発の復元は同じ位置か先に進んだ表示中の先発を追い越さない', () => {
  const { r, skipped } = nextWithoutObservation();
  const competitor = (seconds: number, stage: string) => ({
    ...positions(seconds, stage).trains[0],
    id: laterId,
  });
  const incoming = lateNext(126);
  incoming.trains.push(competitor(126, 'incoming'));
  const progressing = resolve(r, at(126), incoming, skipped.session);
  assert.equal(first(progressing), '10:07');

  const waiting = lateNext(130, 'here');
  waiting.trains.push(competitor(130, 'here'));
  const occupied = resolve(r, at(130), waiting, progressing.session);
  assert.equal(first(occupied), '10:07');
  const missingFirst = resolve(r, at(131), lateNext(131, 'here'), occupied.session);
  assert.equal(first(missingFirst), '10:07');

  const passing = lateNext(135, 'here');
  passing.trains.push(competitor(135, 'outgoing'));
  const recovered = resolve(r, at(135), passing, missingFirst.session);
  assert.equal(first(recovered), '10:06');
  assert.equal(recovered.position?.stage, 'here');
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

test('exact second boundaries: -75 starts the notice, -35 ends it, +30 switches the train', () => {
  const r = route();
  let session: HybridDepartureSession | undefined;
  for (const [s, phase, time] of [
    [-76, 'countdown', '10:05'],
    [-75, 'approaching', '10:05'],
    [-36, 'approaching', '10:05'],
    [-35, 'countdown', '10:05'],
    [0, 'countdown', '10:05'],
    [29, 'countdown', '10:05'],
    [30, 'countdown', '10:06'],
  ] as const) {
    const d = resolve(r, at(s), null, session);
    session = d.session;
    assert.equal(d.presentation?.kind, phase);
    assert.equal(first(d), time);
  }
  assert.deepEqual(hybridTimeline(T), {
    approachStart: T - 75000,
    approachEnd: T - 35000,
    switchAt: T + 30000,
  });
  const baseline = resolve(r, at(-35), null, undefined, true, 0);
  assert.equal(baseline.presentation?.kind, 'approaching');
  assert.equal(baseline.diagnostic?.approachEnd, T - 25000);
  assert.equal(
    resolve(r, at(-25), null, baseline.session, true, 0).presentation?.kind,
    'countdown',
  );
});
test('実測した2方面は時刻表の案内を5秒遅らせ、案内の長さと次発切替を保つ', () => {
  for (const [station, railway, direction, otherDirection, previous] of [
    ['mita', 'Mita', 'Northbound', 'Southbound', 'ShirokaneTakanawa'],
    ['jimbocho', 'Shinjuku', 'Eastbound', 'Westbound', 'Kudanshita'],
  ] as const) {
    const data: StationData = JSON.parse(readFileSync(`public/data/${station}.json`, 'utf8'));
    const r = {
      ...data.routes.find((r) => r.id === `Toei.${railway}.${direction}`)!,
      schedules: route().schedules,
    };
    const opposite = { ...r, id: `Toei.${railway}.${otherDirection}` };
    assert.equal(resolve(opposite, at(-75)).presentation?.kind, 'approaching');
    let d = resolve(r, at(-71));
    assert.equal(d.presentation?.kind, 'countdown');
    d = resolve(r, at(-70), null, d.session);
    assert.equal(d.presentation?.kind, 'approaching');
    assert.equal(d.diagnostic?.approachEnd, at(-30).getTime());
    d = resolve(r, at(-30), null, d.session);
    assert.equal(d.presentation?.kind, 'countdown');
    assert.equal(first(resolve(r, at(29), null, d.session)), '10:05');
    assert.equal(first(resolve(r, at(30), null, d.session)), '10:06');
    const observed = positions(-85, 'incoming');
    Object.assign(observed.trains[0], {
      railwayId: railway,
      direction,
      fromStation: `odpt.Station:Toei.${railway}.${previous}`,
      toStation: r.sourceStationId,
    });
    assert.equal(resolve(r, at(-85), observed).presentation?.kind, 'approaching');
  }
});
for (const delay of [60, 120, 240])
  test(`${delay}s delay needs two fresh local observations and shifts the fixed time axis`, () => {
    const r = route([
      { time: '10:05', destination: '光が丘', type: '普通', trainId: id },
      { time: '10:20', destination: '光が丘', type: '普通' },
    ]);
    let d = resolve(r, at(-220), positions(-220, 'incoming', delay));
    assert.equal(d.diagnostic?.delayMs, 0);
    d = resolve(r, at(-190), positions(-190, 'incoming', delay), d.session);
    assert.equal(d.diagnostic?.delayMs, delay * 1000);
    for (const [s, kind] of [
      [delay - 76, 'countdown'],
      [delay - 75, 'approaching'],
      [delay - 36, 'approaching'],
      [delay - 35, 'countdown'],
      [delay + 29, 'countdown'],
    ] as const) {
      d = resolve(r, at(s), null, d.session);
      assert.equal(first(d), '10:05');
      assert.equal(d.presentation?.kind, kind);
    }
    d = resolve(r, at(delay + 30), null, d.session);
    assert.notEqual(first(d), '10:05');
  });
test('fluctuating delay does not shorten the train lease or reopen a completed notice', () => {
  const r = route();
  let d = resolve(r, at(-220), positions(-220, 'incoming', 120));
  d = resolve(r, at(-190), positions(-190, 'incoming', 120), d.session);
  d = resolve(r, at(45), null, d.session);
  assert.equal(d.presentation?.kind, 'approaching');
  d = resolve(r, at(60), positions(60, 'incoming', 240), d.session);
  d = resolve(r, at(84), null, d.session);
  assert.equal(d.presentation?.kind, 'approaching');
  d = resolve(r, at(85), null, d.session);
  assert.equal(d.presentation?.kind, 'countdown');
  d = resolve(r, at(90), positions(90, 'here', 240), d.session);
  assert.equal(d.presentation?.kind, 'countdown');
  assert.equal(d.diagnostic?.delayMs, 240000);
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

test('進入から発車後まで観測が飛んでも、消灯後30秒は同じ先発を表示する', () => {
  const r = route();
  for (const outbound of [{ ...positions(35, 'clear'), collected: null }, forecast(35, 35)]) {
    let d = resolve(r, at(34), { ...positions(34), collected: null });
    assert.equal(d.presentation?.kind, 'approaching');
    d = resolve(r, at(35), outbound, d.session);
    assert.equal(first(d), '10:05');
    assert.equal(d.presentation?.kind, 'countdown');
    d = resolve(r, at(64), outbound, d.session);
    assert.equal(first(d), '10:05');
    assert.equal(d.presentation?.kind, 'countdown');
    d = resolve(r, at(65), outbound, d.session);
    assert.equal(first(d), '10:06');
    assert.equal(d.session.lastTurnover?.reason, outbound.collected ? 'estimate' : 'clearance');
  }
});
test('only a fresh adjacent incoming segment can start early, never a bare previous station', () => {
  assert.equal(resolve(route(), at(-106), positions(-106)).presentation?.kind, 'countdown');
  assert.equal(resolve(route(), at(-90), positions(-90)).presentation?.kind, 'approaching');
  for (const stage of ['previous', 'far'])
    assert.equal(resolve(route(), at(-90), positions(-90, stage)).presentation?.kind, 'countdown');
  const r = route();
  let d = resolve(r, at(-90), positions(-90));
  d = resolve(r, at(-41), null, d.session);
  assert.equal(d.presentation?.kind, 'approaching');
  d = resolve(r, at(-40), null, d.session);
  assert.equal(d.presentation?.kind, 'countdown');
  d = resolve(r, at(-20), positions(-20), d.session);
  assert.equal(d.presentation?.kind, 'approaching');
  assert.equal(resolve(r, at(-20), null).presentation?.kind, 'countdown');
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
  const p = positions(-90, 'incoming', 120);
  p.trains[0].id = id + '-next';
  const d = resolve(r, at(-90), p);
  assert.equal(first(d), '10:05');
  assert.equal(d.presentation?.kind, 'countdown');
  assert.equal(d.diagnostic?.delayMs, 0);
  const next = resolve(r, at(30), null, d.session);
  assert.equal(first(next), '10:06');
  assert.equal(next.presentation?.kind, 'countdown');
  assert.equal(next.diagnostic?.approachStart, T - 15000);
  assert.equal(next.diagnostic?.approachEnd, T + 25000);
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
