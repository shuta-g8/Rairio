import test from 'node:test';
import assert from 'node:assert/strict';
import { STATIONS as SOURCE } from '../shared/stations.ts';
import { STATIONS } from '../src/generated/station-directory.ts';
import { generateStationDirectory } from '../scripts/generate-station-directory.mjs';

test('軽量な駅一覧は全駅の検索・表示・乗換情報を保ち、取得元の詳細を含まない', () => {
  assert.equal(STATIONS.length, SOURCE.length);
  for (const station of STATIONS) {
    const original = SOURCE.find((source) => source.id === station.id)!;
    assert.equal(station.name, original.name);
    assert.equal(station.english, original.english);
    assert.equal(station.reading, original.reading);
    assert.equal(station.secondaryName, original.secondaryName);
    assert.deepEqual(station.aliases || [], original.aliases || []);
    assert.deepEqual(station.availableRailways, original.availableRailways);
    for (const member of station.memberships!) {
      const sourceMember = original.memberships!.find(
        (source) => source.railwayId === member.railwayId,
      )!;
      assert.equal(member.code, sourceMember.code);
      assert.deepEqual(Object.keys(member).sort(), ['code', 'railwayId']);
    }
  }
});

test('取得元のカタログと画面用の生成ファイルが同期している', async () => {
  await generateStationDirectory({ check: true });
});
