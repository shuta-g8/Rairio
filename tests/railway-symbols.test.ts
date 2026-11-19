import test from 'node:test';
import assert from 'node:assert/strict';
import { STATIONS } from '../shared/stations.ts';
import { groupStationRailways } from '../src/lib/railway-symbols.ts';

test('全駅の接続路線を会社別にまとめても欠落・重複させず、記号と色を持つ', () => {
  for (const station of STATIONS) {
    const groups = groupStationRailways(
      station.availableRailways || [],
      station.memberships![0].railwayId,
    );
    const lines = groups.flatMap((group) => group.railways);
    assert.deepEqual(
      lines.flatMap((line) => line.railwayIds).sort(),
      station.availableRailways!.map((line) => line.id).sort(),
    );
    assert.equal(groups.length, new Set(groups.map((group) => group.id)).size);
    for (const group of groups) {
      assert.equal(
        group.railways.length,
        new Set(group.railways.map((line) => `${line.code}:${line.color}`)).size,
      );
    }
    for (const line of lines) {
      assert.match(line.code, /^[A-Z]{1,2}$/);
      assert.match(line.color, /^#[0-9a-f]{6}$/);
    }
  }
});

test('新宿の京王線・京王新線、練馬の西武各線は同じ記号を1つにまとめて全路線名を保つ', () => {
  for (const [id, operator, code, expectedNames] of [
    ['shinjuku', 'Keio', 'KO', ['京王線', '京王新線']],
    ['nerima', 'Seibu', 'SI', ['西武池袋線', '西武有楽町線', '西武豊島線']],
  ] as const) {
    const station = STATIONS.find((station) => station.id === id)!;
    const group = groupStationRailways(
      station.availableRailways!,
      station.memberships![0].railwayId,
    ).find((group) => group.id === operator)!;
    assert.equal(group.railways.length, 1);
    assert.equal(group.railways[0].code, code);
    for (const name of expectedNames) assert.ok(group.railways[0].name.includes(name));
  }
});

test('乗換駅では選択した都営線が先頭になり、元の接続データを変更しない', () => {
  const station = STATIONS.find((station) => station.id === 'daimon')!;
  const original = structuredClone(station.availableRailways!);
  const groups = groupStationRailways(station.availableRailways!, 'Oedo');
  assert.equal(groups[0].id, 'Toei');
  assert.deepEqual(
    groups[0].railways.map((line) => line.code),
    ['E', 'A'],
  );
  assert.deepEqual(
    groups.find((group) => group.id === 'JR-East')!.railways.map((line) => line.code),
    ['JY', 'JK'],
  );
  assert.deepEqual(station.availableRailways, original);
});

test('JR線は入力順に依存せず、中央・総武線と山手線を優先した案内順に並ぶ', () => {
  for (const [id, expected] of [
    ['shinjuku', ['JC', 'JB', 'JY', 'JA', 'JS']],
    ['yoyogi', ['JB', 'JY']],
    ['daimon', ['JY', 'JK']],
    ['shimbashi', ['JY', 'JK', 'JT', 'JO', 'JJ']],
  ] as const) {
    const station = STATIONS.find((station) => station.id === id)!;
    for (const lines of [station.availableRailways!, [...station.availableRailways!].reverse()]) {
      const groups = groupStationRailways(lines, station.memberships![0].railwayId);
      assert.deepEqual(
        groups.find((group) => group.id === 'JR-East')!.railways.map((line) => line.code),
        expected,
        id,
      );
    }
  }
});
