import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import type { Route, StationData } from '../src/types.ts';
import { toeiStopGuide } from '../src/lib/toei-stops.ts';

function route(station: string, id: string): Route {
  const data: StationData = JSON.parse(readFileSync(`public/data/${station}.json`, 'utf8'));
  return data.routes.find((route) => route.id === `Toei.${id}`)!;
}

test('大江戸線の環状部・支線・都庁前の3方向と途中止まりを区別する', () => {
  const outer = route('kachidoki', 'Oedo.OuterLoop');
  assert.deepEqual(
    toeiStopGuide(outer, { destination: '汐留', type: '普通' })!.stations.map((s) => s.name),
    ['勝どき', '築地市場', '汐留'],
  );
  const long = toeiStopGuide(outer, { destination: '光が丘', type: '普通' })!.stations;
  assert.ok(
    long.findIndex((s) => s.name === '都庁前') < long.findIndex((s) => s.name === '中野坂上'),
  );
  for (const [direction, destination, next] of [
    ['InnerLoop', '清澄白河', '新宿'],
    ['OuterLoop', '光が丘', '新宿西口'],
    ['Toei.Hikarigaoka', '光が丘', '西新宿五丁目'],
  ]) {
    const guide = toeiStopGuide(route('tochomae', `Oedo.${direction}`), {
      destination,
      type: '普通',
    })!;
    assert.equal(guide.stations[0].name, '都庁前');
    assert.equal(guide.stations[1].name, next);
    assert.equal(guide.stations.at(-1)!.name, destination);
  }
});

test('浅草線の直通列車は方向に応じて押上・泉岳寺までを案内し、エアポート快特だけ通過駅を持つ', () => {
  const north = route('daimon', 'Asakusa.Northbound');
  const airport = toeiStopGuide(north, { destination: '成田空港(鉄道)', type: 'エアポート快特' })!;
  assert.equal(airport.through, true);
  assert.deepEqual(
    airport.stations.filter((s) => s.kind === 'stop').map((s) => s.name),
    ['新橋', '日本橋', '東日本橋', '浅草', '押上'],
  );
  assert.equal(airport.stations.find((s) => s.name === '東銀座')!.kind, 'pass');
  const access = toeiStopGuide(north, { destination: '印旛日本医大', type: 'アクセス特急' })!;
  assert.ok(access.stations.every((s) => s.kind !== 'pass'));
  const south = route('daimon', 'Asakusa.Southbound');
  assert.equal(
    toeiStopGuide(south, { destination: '品川', type: '急行' })!.stations.at(-1)!.name,
    '泉岳寺',
  );
  assert.equal(
    toeiStopGuide(south, { destination: '西馬込', type: '普通' })!.stations.at(-1)!.name,
    '西馬込',
  );
});

test('新宿線急行の通過駅と三田線の都営区間内各駅停車を扱う', () => {
  const express = toeiStopGuide(route('shinjuku', 'Shinjuku.Eastbound'), {
    destination: '本八幡',
    type: '急行',
  })!;
  assert.deepEqual(
    express.stations.filter((s) => s.kind === 'stop').map((s) => s.name),
    ['市ヶ谷', '神保町', '馬喰横山', '森下', '大島', '船堀', '本八幡'],
  );
  const west = toeiStopGuide(route('bakuroyokoyama', 'Shinjuku.Westbound'), {
    destination: '橋本',
    type: '普通',
  })!;
  assert.equal(west.through, true);
  assert.equal(west.stations.at(-1)!.name, '新宿');
  const mita = toeiStopGuide(route('mita', 'Mita.Southbound'), {
    destination: '日吉',
    type: '急行',
  })!;
  assert.deepEqual(
    mita.stations.map((s) => s.name),
    ['三田', '白金高輪', '白金台', '目黒'],
  );
  assert.ok(mita.stations.every((s) => s.kind !== 'pass'));
});

test('経路不明・逆方向・未対応種別・通常通過する駅からの出発は推測しない', () => {
  const north = route('daimon', 'Asakusa.Northbound');
  for (const train of [
    { destination: '不明', type: '普通' },
    { destination: '品川', type: '普通' },
    { destination: '押上', type: '臨時' },
    { destination: '三田', type: '普通' },
  ])
    assert.equal(toeiStopGuide(north, train), undefined);
  assert.equal(
    toeiStopGuide({ ...north, sourceStationId: undefined }, { destination: '押上', type: '普通' }),
    undefined,
  );
  assert.equal(
    toeiStopGuide(route('higashiginza', 'Asakusa.Northbound'), {
      destination: '押上',
      type: 'エアポート快特',
    }),
    undefined,
  );
});
