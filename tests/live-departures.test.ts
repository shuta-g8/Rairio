import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import type { StationData, Train } from '../src/types.ts';
import type { TrainPositionsSnapshot } from '../shared/train-positions.ts';
import { departureBoardState, departurePresentation } from '../src/lib/time.ts';
import { resolveLiveDepartures } from '../src/lib/live-departures.ts';

const start = Date.parse('2026-11-07T12:01:50+09:00');
const trainId = 'odpt.Train:Toei.Oedo.TEST';
function fixture(
  trains: Train[] = [
    { time: '12:02', destination: '光が丘', type: '普通', trainId },
    { time: '12:03', destination: '都庁前', type: '普通' },
    { time: '12:04', destination: '光が丘', type: '普通' },
  ],
) {
  const route = (
    JSON.parse(readFileSync('public/data/daimon.json', 'utf8')) as StationData
  ).routes.find((route) => route.id === 'Toei.Oedo.OuterLoop')!;
  route.schedules = { weekday: trains, saturday: trains, holiday: trains };
  return route;
}
const positions: TrainPositionsSnapshot = {
  fetchedAt: new Date(start).toISOString(),
  trains: [
    {
      id: trainId,
      railwayId: 'Oedo',
      direction: 'OuterLoop',
      fromStation: 'odpt.Station:Toei.Oedo.Shiodome',
      toStation: 'odpt.Station:Toei.Oedo.Daimon',
      updatedAt: new Date(start).toISOString(),
      validUntil: new Date(start + 300000).toISOString(),
    },
  ],
};

type Stage = 'incoming' | 'before' | 'here' | 'departed' | 'downstream';
function snapshotAt(elapsed: number, stage: Stage = 'incoming'): TrainPositionsSnapshot {
  const [from, to] = {
    incoming: ['Shiodome', 'Daimon'],
    before: ['Tsukijishijo', 'Shiodome'],
    here: ['Daimon', null],
    departed: ['Daimon', 'Akabanebashi'],
    downstream: ['Akabanebashi', null],
  }[stage];
  return {
    fetchedAt: new Date(start + elapsed).toISOString(),
    trains: positions.trains.map((position) => ({
      ...position,
      fromStation: 'odpt.Station:Toei.Oedo.' + from,
      toStation: to && 'odpt.Station:Toei.Oedo.' + to,
      updatedAt: new Date(start + elapsed).toISOString(),
      validUntil: new Date(start + elapsed + 300000).toISOString(),
    })),
  };
}

const firstTime = (display: ReturnType<typeof resolveLiveDepartures>) =>
  display.board.kind === 'active' ? display.board.departures[0].time : display.board.kind;
const at = (elapsed: number) => new Date(start + elapsed);

for (const elapsed of [30_000, 45_000, 60_000, 180_000])
  test(`当駅付近に${elapsed / 1000}秒存在しても先発を維持し、停車・発車を断定しない`, () => {
    const route = fixture();
    const initial = resolveLiveDepartures(route, at(0), snapshotAt(0, 'here'));
    const display = resolveLiveDepartures(
      route,
      at(elapsed),
      snapshotAt(elapsed, 'here'),
      initial.session,
    );
    assert.equal(firstTime(display), '12:02');
    assert.equal(display.presentation?.kind, 'expired');
    assert.equal(display.livePhase, 'holding');
    assert.equal(display.position?.stage, 'here');
    assert.equal(display.position?.segment, null);
  });

for (const stage of ['departed', 'downstream'] as const)
  test(`${stage}: 有効な発車・通過観測で直ちに次発へ切り替える`, () => {
    const route = fixture();
    let display = resolveLiveDepartures(route, at(0), positions);
    assert.equal(display.presentation?.kind, 'approaching');
    display = resolveLiveDepartures(route, at(30_000), snapshotAt(30_000, 'here'), display.session);
    assert.equal(firstTime(display), '12:02');
    assert.equal(display.presentation?.kind, 'expired');
    display = resolveLiveDepartures(route, at(60_000), snapshotAt(60_000, stage), display.session);
    assert.equal(firstTime(display), '12:03');
    const repeated = resolveLiveDepartures(
      route,
      at(61_000),
      snapshotAt(30_000, 'here'),
      display.session,
    );
    assert.equal(firstTime(repeated), '12:03');
  });

test('初回に発車済みと分かる列車は、予定時刻が未来でも個別に除外する', () => {
  const route = fixture([
    { time: '12:10', destination: '光が丘', type: '普通', trainId },
    { time: '12:20', destination: '都庁前', type: '普通' },
  ]);
  assert.equal(firstTime(resolveLiveDepartures(route, at(0), snapshotAt(0, 'departed'))), '12:20');
});

test('通信断・空応答・失効でも候補を即座に除外せず、接近だけ解除する', () => {
  const route = fixture();
  for (const missing of [null, { fetchedAt: at(30_000).toISOString(), trains: [] }, positions]) {
    let display = resolveLiveDepartures(route, at(0), positions);
    display = resolveLiveDepartures(route, at(90_000), missing, display.session);
    assert.equal(firstTime(display), '12:02');
    assert.equal(display.presentation?.kind, 'expired');
    assert.notEqual(display.livePhase, 'approaching');
    display = resolveLiveDepartures(route, at(179_999), null, display.session);
    assert.equal(firstTime(display), '12:02');
    display = resolveLiveDepartures(route, at(180_000), null, display.session);
    assert.equal(display.board.kind, 'ended');
    assert.notEqual([...display.session.observations.values()][0]?.progress, 'departed');
  }
});

test('同じ先発が予定上に残っていても通信失敗で接近案内を解除する', () => {
  const route = fixture([
    { time: '12:10', destination: '光が丘', type: '普通', trainId },
    { time: '12:20', destination: '都庁前', type: '普通' },
  ]);
  let display = resolveLiveDepartures(route, at(0), positions);
  display = resolveLiveDepartures(route, at(1_000), null, display.session);
  assert.equal(firstTime(display), '12:10');
  assert.equal(display.presentation?.kind, 'countdown');
  display = resolveLiveDepartures(route, at(500_000), null, display.session);
  assert.notEqual(display.presentation?.kind, 'approaching');
});

test('再取得時刻や同じ生成時刻の有効期限変更で観測の寿命を延長しない', () => {
  const route = fixture();
  const short = snapshotAt(0);
  short.trains[0].validUntil = at(5_000).toISOString();
  let display = resolveLiveDepartures(route, at(0), short);
  const extended = { ...positions, fetchedAt: at(6_000).toISOString() };
  display = resolveLiveDepartures(route, at(6_000), extended, display.session);
  assert.notEqual(display.presentation?.kind, 'approaching');
  display = resolveLiveDepartures(
    route,
    at(90_000),
    { ...extended, fetchedAt: at(90_000).toISOString() },
    display.session,
  );
  assert.equal(firstTime(display), '12:02');
  assert.equal(display.presentation?.kind, 'expired');
});

test('当駅付近を確認した後の古い接近応答・新しい後退位置を採用しない', () => {
  const route = fixture();
  let display = resolveLiveDepartures(route, at(0), positions);
  display = resolveLiveDepartures(route, at(20_000), snapshotAt(20_000, 'here'), display.session);
  for (const [received, source, stage] of [
    [30_000, 10_000, 'incoming'],
    [40_000, 40_000, 'before'],
    [45_000, 30_000, 'incoming'],
  ] as const) {
    display = resolveLiveDepartures(
      route,
      at(received),
      snapshotAt(source, stage),
      display.session,
    );
    assert.equal(firstTime(display), '12:02');
    assert.equal(display.presentation?.kind, 'expired');
    assert.equal(display.position, undefined);
  }
  display = resolveLiveDepartures(
    route,
    at(60_000),
    snapshotAt(60_000, 'departed'),
    display.session,
  );
  assert.equal(firstTime(display), '12:03');
});

test('同一生成時刻の矛盾は保留し、より新しい観測でのみ復旧する', () => {
  const route = fixture();
  let display = resolveLiveDepartures(route, at(0), positions);
  display = resolveLiveDepartures(route, at(1_000), snapshotAt(0, 'here'), display.session);
  assert.notEqual(display.presentation?.kind, 'approaching');
  display = resolveLiveDepartures(route, at(2_000), positions, display.session);
  assert.notEqual(display.presentation?.kind, 'approaching');
  display = resolveLiveDepartures(route, at(10_000), snapshotAt(10_000), display.session);
  assert.equal(display.presentation?.kind, 'approaching');
});

test('予定を3分過ぎた列車を位置から先発へ戻し、時刻やカウントダウンを補正しない', () => {
  const route = fixture([
    { time: '12:00', destination: '光が丘', type: '普通', trainId },
    { time: '12:05', destination: '都庁前', type: '普通' },
  ]);
  const elapsed = 70_000;
  const snapshot = snapshotAt(elapsed, 'before');
  snapshot.trains[0].delay = 300;
  const display = resolveLiveDepartures(route, at(elapsed), snapshot);
  assert.equal(firstTime(display), '12:00');
  assert.equal(display.presentation?.kind, 'expired');
  assert.equal(
    display.board.kind === 'active' && display.board.departures[0].timestamp,
    Date.parse('2026-11-07T12:00:00+09:00'),
  );
  const missing = resolveLiveDepartures(route, at(elapsed + 1_000), null, display.session);
  assert.equal(firstTime(missing), '12:00');
});

test('誤ったID・方向・路線・古い位置・範囲外の遅延列車は復帰させない', () => {
  const route = fixture([
    { time: '12:00', destination: '光が丘', type: '普通', trainId },
    { time: '12:05', destination: '都庁前', type: '普通' },
  ]);
  for (const change of [
    { id: 'odpt.Train:Toei.Oedo.OTHER' },
    { direction: 'InnerLoop' },
    { railwayId: 'Asakusa' },
    { updatedAt: at(-90_000).toISOString() },
    { fromStation: 'odpt.Station:Toei.Oedo.UNKNOWN' },
  ]) {
    const snapshot = snapshotAt(70_000, 'before');
    Object.assign(snapshot.trains[0], change);
    assert.equal(firstTime(resolveLiveDepartures(route, at(70_000), snapshot)), '12:05');
  }
  const oldRoute = fixture([
    { time: '11:50', destination: '光が丘', type: '普通', trainId },
    { time: '12:05', destination: '都庁前', type: '普通' },
  ]);
  assert.equal(firstTime(resolveLiveDepartures(oldRoute, at(70_000), snapshotAt(70_000))), '12:05');
});

test('次発の位置が先でも予定時刻順を保ち、通信断・発車確認でも時刻を逆転させない', () => {
  const route = fixture([
    { time: '12:00', destination: '光が丘', type: '普通', trainId },
    { time: '12:05', destination: '光が丘', type: '普通', trainId: trainId + 'B' },
    { time: '12:10', destination: '光が丘', type: '普通' },
  ]);
  const snapshot = snapshotAt(70_000, 'before');
  snapshot.trains.push({ ...snapshotAt(70_000, 'here').trains[0], id: trainId + 'B' });
  let display = resolveLiveDepartures(route, at(70_000), snapshot);
  const times = () =>
    display.board.kind === 'active' && display.board.departures.map((train) => train.time);
  assert.deepEqual(times(), ['12:00', '12:05']);
  assert.equal(display.presentation?.kind, 'expired');
  display = resolveLiveDepartures(route, at(71_000), null, display.session);
  assert.deepEqual(times(), ['12:00', '12:05']);
  // A session created before this fix must not reinstate an inverted order.
  display = resolveLiveDepartures(route, at(72_000), null, {
    ...display.session,
    order: [...display.session.order].reverse(),
  });
  assert.deepEqual(times(), ['12:00', '12:05']);
  const departed = snapshotAt(90_000, 'before');
  departed.trains.push({ ...snapshotAt(90_000, 'departed').trains[0], id: trainId + 'B' });
  display = resolveLiveDepartures(route, at(90_000), departed, display.session);
  assert.deepEqual(times(), ['12:00', '12:10']);
  display = resolveLiveDepartures(
    route,
    at(100_000),
    snapshotAt(100_000, 'departed'),
    display.session,
  );
  assert.deepEqual(times(), ['12:10', '12:00']);
  assert.ok(
    display.board.kind === 'active' &&
      display.board.departures[0].timestamp < display.board.departures[1].timestamp,
    '翌営業日の時刻も日付を含めて昇順になる',
  );
});

test('位置順が不明・同一区間の場合は予定順を維持する', () => {
  const route = fixture([
    { time: '12:02', destination: '光が丘', type: '普通', trainId },
    { time: '12:03', destination: '光が丘', type: '普通', trainId: trainId + 'B' },
  ]);
  const same = snapshotAt(0, 'before');
  same.trains.push({ ...same.trains[0], id: trainId + 'B' });
  assert.equal(firstTime(resolveLiveDepartures(route, at(0), same)), '12:02');
  const onlyB = snapshotAt(0, 'here');
  onlyB.trains[0].id += 'B';
  assert.equal(firstTime(resolveLiveDepartures(route, at(0), onlyB)), '12:02');
});

test('同じ列車IDを再利用したダイヤ・重複したAPI列車は推測で復帰させない', () => {
  const route = fixture([
    { time: '12:00', destination: '光が丘', type: '普通', trainId },
    { time: '12:05', destination: '光が丘', type: '普通', trainId },
  ]);
  assert.equal(firstTime(resolveLiveDepartures(route, at(70_000), snapshotAt(70_000))), '12:05');
  const unique = fixture([
    { time: '12:00', destination: '光が丘', type: '普通', trainId },
    { time: '12:05', destination: '都庁前', type: '普通' },
  ]);
  const duplicate = snapshotAt(70_000);
  duplicate.trains.push({ ...duplicate.trains[0] });
  assert.equal(firstTime(resolveLiveDepartures(unique, at(70_000), duplicate)), '12:05');
});

test('追跡中の列車は10分の検索窓を越えても新鮮な位置があれば維持する', () => {
  const route = fixture();
  let display = resolveLiveDepartures(route, at(0), snapshotAt(0, 'here'));
  for (let elapsed = 60_000; elapsed <= 720_000; elapsed += 60_000) {
    display = resolveLiveDepartures(
      route,
      at(elapsed),
      snapshotAt(elapsed, 'here'),
      display.session,
    );
    assert.equal(firstTime(display), '12:02');
  }
});

test('同じ応答の再描画は状態を書き換えず、モード変更でも同じセッションを使える', () => {
  const route = fixture();
  const first = resolveLiveDepartures(route, at(0), positions);
  const repeated = resolveLiveDepartures(route, at(1_000), positions, first.session);
  assert.equal(repeated.session, first.session);
  assert.equal(firstTime(repeated), firstTime(first));
});

test('駅・営業日・時計の巻き戻りで観測状態をリセットする', () => {
  const route = fixture();
  const first = resolveLiveDepartures(route, at(20_000), snapshotAt(20_000, 'here'));
  for (const [otherRoute, now] of [
    [fixture(), at(21_000)],
    [route, at(86_400_000)],
    [route, at(0)],
  ] as const) {
    const reset = resolveLiveDepartures(otherRoute, now, null, first.session);
    assert.equal(reset.session.observations.size, 0);
    assert.equal(reset.livePhase, undefined);
  }
});

test('位置が一度も得られない場合は従来の時刻表の候補と案内を保つ', () => {
  const route = fixture();
  for (const elapsed of [0, 20_000, 30_000, 130_000, 86_400_000]) {
    const display = resolveLiveDepartures(route, at(elapsed), null);
    const expected = departureBoardState(route, at(elapsed));
    assert.deepEqual(display.board, expected);
    if (expected.kind === 'active')
      assert.deepEqual(
        display.presentation,
        departurePresentation(expected.departures[0].timestamp, at(elapsed)),
      );
  }
});

test('列車候補の保持中も、前々駅・前駅・当駅の有効な位置案内を渡す', () => {
  const route = fixture();
  for (const [from, to, stage, segment] of [
    ['Tsukijishijo', null, 'before-previous', null],
    ['Tsukijishijo', 'Shiodome', 'before-previous', 'first'],
    ['Shiodome', null, 'previous', null],
    ['Daimon', null, 'here', null],
  ] as const) {
    const snapshot = snapshotAt(30_000);
    Object.assign(snapshot.trains[0], {
      fromStation: `odpt.Station:Toei.Oedo.${from}`,
      toStation: to && `odpt.Station:Toei.Oedo.${to}`,
    });
    const display = resolveLiveDepartures(route, at(30_000), snapshot);
    assert.equal(firstTime(display), '12:02');
    assert.equal(display.livePhase, 'holding');
    assert.equal(display.position?.stage, stage);
    assert.equal(display.position?.segment, segment);
    assert.notEqual(display.presentation?.kind, 'approaching');
    assert.doesNotMatch(display.position!.description, /停車/);
  }
});

test('接近案内の表示判断とは独立して位置を渡し、当駅付近で位置案内へ復帰できる', () => {
  const route = fixture();
  let display = resolveLiveDepartures(route, at(0), snapshotAt(0, 'before'));
  assert.equal(display.position?.stage, 'before-previous');
  display = resolveLiveDepartures(route, at(30_000), snapshotAt(30_000), display.session);
  assert.equal(display.presentation?.kind, 'approaching');
  assert.equal(display.position?.segment, 'second');
  display = resolveLiveDepartures(route, at(60_000), snapshotAt(60_000, 'here'), display.session);
  assert.equal(firstTime(display), '12:02');
  assert.equal(display.presentation?.kind, 'expired');
  assert.equal(display.position?.stage, 'here');
  const missing = resolveLiveDepartures(route, at(61_000), null, display.session);
  assert.equal(firstTime(missing), '12:02');
  assert.equal(missing.position, undefined);
  display = resolveLiveDepartures(
    route,
    at(90_000),
    snapshotAt(90_000, 'departed'),
    missing.session,
  );
  assert.equal(firstTime(display), '12:04');
  assert.equal(display.position, undefined);
});

test('当駅の位置案内は古い応答・失効・同時刻の矛盾から復帰しない', () => {
  const route = fixture();
  let display = resolveLiveDepartures(route, at(0), snapshotAt(0, 'before'));
  display = resolveLiveDepartures(route, at(30_000), snapshotAt(30_000, 'here'), display.session);
  assert.equal(display.position?.stage, 'here');
  for (const [received, snapshot] of [
    [40_000, snapshotAt(0, 'before')],
    [50_000, snapshotAt(30_000, 'incoming')],
    [60_000, snapshotAt(30_000, 'here')],
  ] as const) {
    display = resolveLiveDepartures(route, at(received), snapshot, display.session);
    assert.equal(display.position, undefined);
    assert.equal(firstTime(display), '12:02');
  }
  display = resolveLiveDepartures(route, at(90_000), snapshotAt(90_000, 'here'), display.session);
  assert.equal(display.position?.stage, 'here');
  const expired = resolveLiveDepartures(
    route,
    at(180_000),
    snapshotAt(90_000, 'here'),
    display.session,
  );
  assert.equal(expired.position, undefined);
  assert.equal(firstTime(expired), '12:02');
});
