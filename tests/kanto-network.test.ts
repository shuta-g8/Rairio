import test from 'node:test';
import assert from 'node:assert/strict';
import {
  KANTO_NETWORK,
  NETWORK_LINES,
  NETWORK_STATIONS,
  networkPathsTo,
} from '../src/lib/kanto-network.ts';
import { guidanceConnections } from '../src/lib/journey-guidance.ts';
import { exactJourneyPlace, searchJourneyPlaces } from '../src/lib/journey-place-search.ts';

test('関東1都6県の営業駅を収録し、全都営駅を駅グループへ接続する', () => {
  assert.equal(Object.keys(KANTO_NETWORK.toei).length, 99);
  assert.ok(KANTO_NETWORK.stations.length >= 1800);
  for (const pref of [8, 9, 10, 11, 12, 13, 14])
    assert.ok(KANTO_NETWORK.stations.filter((s) => s.pref === pref).length > 50);
  for (const group of Object.values(KANTO_NETWORK.toei)) assert.ok(NETWORK_STATIONS.has(group));
  assert.ok(KANTO_NETWORK.lines.every((l) => !l.name.includes('新幹線')));
});

test('各県の代表駅を検索し、都営駅から連続した他社線の補助経路を返す', () => {
  for (const name of ['横浜', '大宮', '千葉', '水戸', '宇都宮', '前橋', '東京']) {
    const place = exactJourneyPlace(name)!;
    assert.ok(place?.id.startsWith('kanto:'), name);
    const connections = guidanceConnections(place.id);
    assert.ok(connections.length > 0, name);
    for (const connection of connections) {
      const segments = connection.segments!;
      assert.equal(segments[0].fromId, KANTO_NETWORK.toei[connection.station]);
      assert.equal(segments.at(-1)!.toId, place.id.slice(6));
      for (const [i, segment] of segments.entries()) {
        const line = NETWORK_LINES.get(segment.lineId)!;
        assert.ok(line.stations.includes(segment.fromId));
        assert.ok(line.stations.includes(segment.toId));
        assert.ok(!['99301', '99302', '99303', '99304', '11328'].includes(segment.lineId));
        if (i) assert.equal(segments[i - 1].toId, segment.fromId);
      }
    }
  }
});

test('逆方向の案内は同じ接続を逆順にして、都営の乗換駅へ到達する', () => {
  const place = exactJourneyPlace('水戸')!;
  const outgoing = guidanceConnections(place.id)[0];
  const incoming = guidanceConnections(place.id, true).find((c) => c.station === outgoing.station)!;
  assert.equal(incoming.segments![0].fromId, outgoing.segments!.at(-1)!.toId);
  assert.equal(incoming.segments!.at(-1)!.toId, KANTO_NETWORK.toei[incoming.station]);
  assert.deepEqual(
    incoming.segments!.map((s) => s.lineId),
    outgoing.segments!.map((s) => s.lineId).reverse(),
  );
});

test('乗換駅グループ内でも入力した駅名を保持し、徒歩連絡を区別する', () => {
  const place = exactJourneyPlace('京成千葉')!;
  assert.ok(place.name.startsWith('京成千葉（'));
  assert.ok(searchJourneyPlaces('京成千葉').some((p) => p.id === place.id));
  assert.ok(guidanceConnections(place.id).every((c) => c.walkTo === '京成千葉'));
  assert.equal(networkPathsTo('unknown').size, 0);
});
