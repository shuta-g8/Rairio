import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { STATIONS } from '../shared/stations.ts';
import { stationDisplayName } from '../src/lib/stations.ts';
import { searchStations } from '../src/lib/station-search.ts';
import { destinationPresentation } from '../src/lib/destinations.ts';

test('公式の副名称8駅は表示と検索に適用し、出典照合用の正式名を保つ', () => {
  const expected = {
    daimon: ['浜松町', 'Hamamatsucho'],
    oshiage: ['スカイツリー前', 'すかいつりーまえ'],
    kasuga: ['文京シビックセンター前', 'ぶんきょうしびっくせんたー'],
    iwamotocho: ['秋葉原', 'Akihabara'],
    ryogoku: ['江戸東京博物館前', 'えどとうきょうはくぶつかん'],
    shiodome: ['シオサイト', 'シオサイト'],
    kokuritsukyogijo: ['東京体育館前', 'とうきょうたいいくかん'],
    nishishinjukugochome: ['清水橋', 'しみずばし'],
  };
  assert.equal(STATIONS.filter((station) => station.secondaryName).length, 8);
  for (const [id, [secondary, query]] of Object.entries(expected)) {
    const station = STATIONS.find((station) => station.id === id)!;
    assert.equal(station.secondaryName, secondary);
    assert.ok(!station.name.includes('['));
    assert.equal(stationDisplayName(station), `${station.name}[${secondary}]`);
    assert.equal(stationDisplayName(station.name), `${station.name}[${secondary}]`);
    for (const term of [
      query,
      secondary,
      stationDisplayName(station),
      `${station.name}（${secondary}）駅`,
    ])
      assert.ok(
        searchStations(term).matches.some((match) => match.id === id),
        term,
      );
  }
  assert.equal(stationDisplayName('五反田'), '五反田');
  assert.equal(destinationPresentation('押上').name, '押上');
  assert.equal(destinationPresentation('押上').english, 'Oshiage');
});

test('全99駅に自駅の所属路線と接続路線を重複なく用意し、全駅の確認元を保持する', () => {
  for (const station of STATIONS) {
    const lines = station.availableRailways!;
    assert.ok(lines.length, station.id);
    assert.equal(new Set(lines.map((line) => line.id)).size, lines.length);
    assert.equal(new Set(lines.map((line) => line.name)).size, lines.length);
    for (const member of station.memberships!)
      assert.ok(lines.some((line) => line.id === `Toei.${member.railwayId}`));
    assert.ok(lines.every((line) => line.name && !line.name.includes('odpt.')));
    assert.match(
      station.stationInfoUrl!,
      /^https:\/\/www\.kotsu\.metro\.tokyo\.jp\/subway\/stations\/.+\.html$/,
    );
  }
  const lines = (id: string) =>
    STATIONS.find((station) => station.id === id)!.availableRailways!.map((line) => line.id);
  assert.deepEqual(
    lines('daimon').sort(),
    [
      'Toei.Asakusa',
      'Toei.Oedo',
      'JR-East.Yamanote',
      'JR-East.KeihinTohokuNegishi',
      'TokyoMonorail.HanedaAirport',
    ].sort(),
  );
  assert.ok(lines('iwamotocho').includes('MIR.TsukubaExpress'));
  assert.ok(lines('shirokanedai').includes('TokyoMetro.Namboku'));
  assert.ok(lines('toshimaen').includes('Seibu.Toshima'));
  assert.ok(lines('shinjuku').includes('TokyoMetro.Marunouchi'));
  const sources = JSON.parse(readFileSync('public/metadata/station-guidance-sources.json', 'utf8'));
  assert.equal(sources.stationPages.length, 99);
  assert.equal(new Set(sources.stationPages.map((page: { id: string }) => page.id)).size, 99);
});
