import test from 'node:test';
import assert from 'node:assert/strict';
import type { Route } from '../src/types.ts';
import { toeiBoardDestination } from '../src/lib/toei-board.ts';

const route: Route = {
  id: 'Toei.Oedo.OuterLoop',
  railwayId: 'Oedo',
  line: '都営大江戸線',
  direction: '大門・六本木',
  sourceStationId: 'odpt.Station:Toei.Oedo.Kachidoki',
  color: '#b6007a',
  sourceUrl: '',
  schedules: { weekday: [], saturday: [], holiday: [] },
};

test('大江戸線以外は方面名に置き換えず、実際の行先とその駅番号を表示する', () => {
  const result = toeiBoardDestination(
    { ...route, line: '都営三田線', railwayId: 'Mita', direction: '西高島平' },
    '高島平',
  );
  assert.equal(result.terminal, true);
  assert.equal(result.stations[0].name, '高島平');
  assert.equal(result.stations[0].code, 'I-25');
});

test('直通先の駅番号は行先と都営線の進行方向で決まる', () => {
  for (const [railwayId, direction, line, destination, code] of [
    ['Mita', 'Southbound', '都営三田線', '海老名', 'SO-18'],
    ['Mita', 'Southbound', '都営三田線', '日吉', 'MG-13'],
    ['Mita', 'Southbound', '都営三田線', '新横浜', 'SH-01'],
    ['Mita', 'Southbound', '都営三田線', '目黒', 'I-01'],
    ['Asakusa', 'Northbound', '都営浅草線', '京成成田', 'KS-40'],
    ['Asakusa', 'Northbound', '都営浅草線', '成田空港(鉄道)', 'KS-42'],
    ['Asakusa', 'Northbound', '都営浅草線', '印旛日本医大', 'HS-14'],
    ['Asakusa', 'Northbound', '都営浅草線', '芝山千代田', 'SR-01'],
    ['Asakusa', 'Southbound', '都営浅草線', '三浦海岸', 'KK-71'],
    ['Asakusa', 'Southbound', '都営浅草線', '羽田空港第１・第２ターミナル(京急)', 'KK-17'],
    ['Shinjuku', 'Westbound', '都営新宿線', '橋本', 'KO-45'],
    ['Shinjuku', 'Eastbound', '都営新宿線', '橋本', undefined],
  ] as const) {
    const { stations } = toeiBoardDestination(
      { ...route, id: `Toei.${railwayId}.${direction}`, railwayId, line },
      destination,
    );
    assert.equal(stations[0].code, code, destination);
  }
});

const airportRoute: Route = {
  ...route,
  id: 'Toei.Asakusa.Northbound',
  railwayId: 'Asakusa',
  line: '都営浅草線',
  direction: '押上',
};
const airport = '成田空港(鉄道)';

test('成田空港行に経由線名と行先を順に表示し、公式の経由情報を優先する', () => {
  for (const [train, name, reading, english] of [
    [{ type: 'アクセス特急' }, '北総線', 'ほくそうせん', 'Hokuso Line'],
    [{ type: '快速' }, '京成線', 'けいせいせん', 'Keisei Line'],
    [{ type: 'エアポート快特', naritaVia: 'keisei' }, '京成線', 'けいせいせん', 'Keisei Line'],
  ] as const) {
    const result = toeiBoardDestination(airportRoute, airport, train);
    assert.equal(result.via, true);
    assert.equal(result.terminal, true);
    assert.deepEqual(result.stations[0], { name, reading, english, code: undefined });
    assert.equal(result.stations[1].name, '成田空港');
    assert.equal(result.stations[1].code, 'KS-42');
  }
  assert.equal(toeiBoardDestination(airportRoute, '京成高砂', { type: '快速' }).via, false);
  assert.equal(
    toeiBoardDestination({ ...airportRoute, id: 'Toei.Asakusa.Southbound' }, airport, {
      type: '快速',
    }).via,
    false,
  );
});

test('エアポート快特は同じ種別でも公式に照合した番号と曜日で経由を分ける', () => {
  const active: Route = {
    ...airportRoute,
    timetableEditions: [
      {
        id: 'asakusa-2026-11-21',
        effectiveFrom: '2026-11-21',
        effectiveToExclusive: null,
        schedules: airportRoute.schedules,
        sha256: '0'.repeat(64),
      },
    ],
  };
  for (const [number, day, viaRailway] of [
    ['901K', 'weekday', 'hokuso'],
    ['2071K', 'weekday', 'keisei'],
    ['969H', 'saturday', 'hokuso'],
    ['2071K', 'holiday', undefined],
    ['2001K', 'weekday', undefined],
  ] as const) {
    const result = toeiBoardDestination(active, airport, {
      type: 'エアポート快特',
      trainId: `odpt.Train:Toei.Asakusa.${number}`,
      day,
      serviceDate: day === 'weekday' ? '2026-11-24' : '2026-11-28',
    });
    assert.equal(result.viaRailway, viaRailway);
    assert.equal(result.stations.at(-1)?.name, '成田空港');
  }
  assert.equal(
    toeiBoardDestination(airportRoute, airport, {
      type: 'エアポート快特',
      trainId: 'odpt.Train:Toei.Asakusa.901K',
      day: 'weekday',
      serviceDate: '2026-11-24',
    }).via,
    false,
  );
});

test('勝どきの外回りは、駅順を確認して大門経由の光が丘・都庁前行を表示する', () => {
  for (const destination of ['光が丘', '都庁前']) {
    const result = toeiBoardDestination(route, destination);
    assert.equal(result.via, true);
    assert.deepEqual(
      result.stations.map((station) => station.name),
      ['大門', destination],
    );
    assert.equal(result.stations[0].code, 'E-20');
  }
});

test('内回りの短距離列車に、終着駅より先の経由駅を付けない', () => {
  const inner = { ...route, id: 'Toei.Oedo.InnerLoop', direction: '両国・春日' };
  assert.equal(toeiBoardDestination(inner, '清澄白河').via, false);
  const result = toeiBoardDestination(inner, '都庁前');
  assert.equal(result.via, true);
  assert.deepEqual(
    result.stations.map((station) => station.code),
    ['E-12', 'E-28'],
  );
});

test('経路を確認できない列車や、最初の方面駅で終着する列車は方面表示を保つ', () => {
  assert.equal(toeiBoardDestination({ ...route, sourceStationId: undefined }, '光が丘').via, false);
  assert.equal(toeiBoardDestination(route, '大門').via, false);
  assert.equal(
    toeiBoardDestination(
      { ...route, id: 'Toei.Oedo.Toei.Hikarigaoka', direction: '光が丘' },
      '光が丘',
    ).via,
    false,
  );
  assert.equal(
    toeiBoardDestination(
      { ...route, railwayId: 'Asakusa', line: '都営浅草線', id: 'Toei.Asakusa.Northbound' },
      '光が丘',
    ).via,
    false,
  );
});
