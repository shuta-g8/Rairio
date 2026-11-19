import test from 'node:test';
import assert from 'node:assert/strict';
import { journeyDirection } from '../src/lib/journey-direction.ts';
import { KANTO_NETWORK, type NetworkSegment } from '../src/lib/kanto-network.ts';

function yamanote(from: string, to: string): NetworkSegment {
  const station = (name: string) =>
    KANTO_NETWORK.stations.find((s) => s.names.includes(name) && s.lines.includes('11302'))!;
  return {
    lineId: '11302',
    line: 'JR山手線',
    from,
    to,
    fromId: station(from).id,
    toId: station(to).id,
  };
}

test('山手線は短い経路に合わせて内外回りと進行方向の主要駅を示す', () => {
  assert.equal(journeyDirection(yamanote('五反田', '新宿')), '外回り・渋谷・新宿方面');
  assert.equal(journeyDirection(yamanote('新宿', '五反田')), '内回り・渋谷・品川方面');
  assert.equal(journeyDirection(yamanote('新橋', '東京')), '内回り・東京・上野方面');
  assert.equal(journeyDirection(yamanote('東京', '有楽町')), '外回り・品川・渋谷方面');
  assert.equal(journeyDirection(yamanote('有楽町', '東京')), '内回り・東京・上野方面');
});

test('その他の路線や不明な山手線駅では方面のみで列車の行先を断定しない', () => {
  const segment = { ...yamanote('五反田', '新宿'), lineId: 'other', to: '横浜' };
  assert.equal(journeyDirection(segment), '横浜方面');
  assert.equal(journeyDirection({ ...segment, lineId: '11302', fromId: 'unknown' }), '横浜方面');
});
