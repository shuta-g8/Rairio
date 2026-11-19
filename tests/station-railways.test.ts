import test from 'node:test';
import assert from 'node:assert/strict';
import { STATION_RAILWAYS, stationRailwayId } from '../src/lib/stations.ts';

test('路線ごとの駅を駅順で返し、大江戸線の都庁前を重複させない', () => {
  assert.deepEqual(
    STATION_RAILWAYS.map((line) => line.stations.length),
    [20, 27, 21, 38],
  );
  const asakusa = STATION_RAILWAYS.find((line) => line.id === 'Asakusa')!;
  assert.equal(asakusa.stations[0].id, 'nishimagome');
  assert.equal(asakusa.stations.at(-1)!.id, 'oshiage');
  const oedo = STATION_RAILWAYS.find((line) => line.id === 'Oedo')!;
  assert.equal(oedo.stations.filter((station) => station.id === 'tochomae').length, 1);
  assert.equal(oedo.stations.at(-1)!.id, 'hikarigaoka');
});

test('乗換駅では選択中の路線を保ち、別路線の駅を直接選ぶと所属路線に切り替える', () => {
  assert.equal(stationRailwayId('mita', 'Mita'), 'Mita');
  assert.equal(stationRailwayId('mita', 'Asakusa'), 'Asakusa');
  assert.equal(stationRailwayId('hikarigaoka', 'Asakusa'), 'Oedo');
  assert.equal(stationRailwayId('motoyawata', 'Mita'), 'Shinjuku');
  assert.equal(stationRailwayId('gotanda'), 'Asakusa');
});
