import {
  TIMETABLE_SOURCE,
  DATA_LICENSE,
  DATA_PROVIDER,
  TOEI_OPERATOR,
} from '../shared/transit-source.ts';

const LINES = {
  'odpt.Railway:Toei.Asakusa': {
    name: '都営浅草線',
    color: '#e85298',
    Northbound: '押上',
    Southbound: '西馬込',
  },
  'odpt.Railway:Toei.Oedo': {
    name: '都営大江戸線',
    color: '#b6007a',
    InnerLoop: '両国・春日',
    OuterLoop: '六本木・新宿',
    'Toei.Hikarigaoka': '光が丘',
  },
  'odpt.Railway:Toei.Mita': {
    name: '都営三田線',
    color: '#0067b0',
    Northbound: '西高島平',
    Southbound: '目黒',
  },
  'odpt.Railway:Toei.Shinjuku': {
    name: '都営新宿線',
    color: '#9fb01c',
    Eastbound: '本八幡',
    Westbound: '新宿',
  },
};

// Names label identifiers in the Toei feed, including through services.
const THROUGH_STATIONS = {
  ImbaNihonIdai: '印旛日本医大',
  InzaiMakinohara: '印西牧の原',
  Aoto: '青砥',
  KeiseiTakasago: '京成高砂',
  NaritaAirportTerminal1: '成田空港(鉄道)',
  KeiseiNarita: '京成成田',
  KeiseiSakura: '京成佐倉',
  ShibayamaChiyoda: '芝山千代田',
  Sogosando: '宗吾参道',
  HanedaAirportTerminal1and2: '羽田空港第１・第２ターミナル(京急)',
  Misakiguchi: '三崎口',
  KeikyuKurihama: '京急久里浜',
  Miurakaigan: '三浦海岸',
  ZushiHayama: '逗子・葉山',
  Shinagawa: '品川',
  KanazawaBunko: '金沢文庫',
  KanagawaShimmachi: '神奈川新町',
  KeikyuKawasaki: '京急川崎',
  Uraga: '浦賀',
  ShinYokohama: '新横浜',
  Hiyoshi: '日吉',
  Ebina: '海老名',
  Nishiya: '西谷',
  Shonandai: '湘南台',
  MusashiKosugi: '武蔵小杉',
  Yamato: '大和',
  Sasazuka: '笹塚',
  Hashimoto: '橋本',
  Wakabadai: '若葉台',
  KeioTamaCenter: '京王多摩センター',
};

export function createLookups(stations, trainTypes, trainTimetables = [], railways = []) {
  const names = new Map(
    stations
      .filter((x) => x['odpt:operator'] === TOEI_OPERATOR)
      .map((x) => [x['owl:sameAs'], x['odpt:stationTitle']?.ja || x['dc:title']]),
  );
  const types = new Map(
    trainTypes
      .filter((x) => x['odpt:operator'] === TOEI_OPERATOR)
      .map((x) => [x['owl:sameAs'], x['odpt:trainTypeTitle']?.ja || x['dc:title']]),
  );
  const trains = new Map(
    trainTimetables
      .filter((x) => x['odpt:operator'] === TOEI_OPERATOR)
      .map((x) => [`${x['odpt:train']}|${x['odpt:calendar']}`, x]),
  );
  return { names, types, trains, railways };
}

export function parseTimetable(table, lookups) {
  if (
    table?.['odpt:operator'] !== TOEI_OPERATOR ||
    !Array.isArray(table['odpt:stationTimetableObject'])
  )
    throw new Error('都営の時刻表データが不足しています。');
  return table['odpt:stationTimetableObject']
    .map((entry) => {
      const time = entry['odpt:departureTime'];
      const type = lookups.types.get(entry['odpt:trainType']);
      const train = lookups.trains.get(`${entry['odpt:train']}|${table['odpt:calendar']}`);
      // A circulating train can pass a station again: match the exact stop and time.
      const matchingStop = train?.['odpt:trainTimetableObject']?.some(
        (stop) =>
          stop['odpt:departureStation'] === table['odpt:station'] &&
          stop['odpt:departureTime'] === time,
      );
      const destinations =
        entry['odpt:destinationStation'] ||
        (matchingStop ? train['odpt:destinationStation'] : undefined);
      const destination = destinations
        ?.map((id) => lookups.names.get(id) || THROUGH_STATIONS[id.split('.').at(-1)])
        .filter(Boolean)
        .join('・');
      const carCount =
        entry['odpt:carComposition'] ?? (matchingStop ? train['odpt:carComposition'] : undefined);
      if (
        !/^([01]\d|2[0-3]):[0-5]\d$/.test(time) ||
        !type ||
        !destination ||
        destinations?.some(
          (id) => !lookups.names.get(id) && !THROUGH_STATIONS[id.split('.').at(-1)],
        )
      )
        throw new Error(
          `時刻・種別・行先を照合できません: ${table['owl:sameAs']} ${JSON.stringify(entry)}`,
        );
      return {
        time,
        destination,
        type,
        ...(typeof entry['odpt:train'] === 'string' &&
        entry['odpt:train'].startsWith('odpt.Train:Toei.')
          ? { trainId: entry['odpt:train'] }
          : {}),
        ...(entry['odpt:platformNumber'] ? { platform: String(entry['odpt:platformNumber']) } : {}),
        ...(Number.isInteger(carCount) && carCount > 0 && carCount <= 20 ? { carCount } : {}),
      };
    })
    .sort((a, b) => serviceMinute(a) - serviceMinute(b));
}

export function buildStation(station, tables, lookups, fetchedAt, managedAsakusa) {
  const sourceIds = new Set(station.memberships?.map((item) => item.sourceStationId));
  const stationTables = tables.filter(
    (table) =>
      table['odpt:operator'] === TOEI_OPERATOR &&
      LINES[table['odpt:railway']] &&
      sourceIds.has(table['odpt:station']),
  );
  const expectedTables = station.memberships.flatMap((item) => item.timetableIds).sort();
  const actualTables = stationTables.map((table) => table['owl:sameAs']).sort();
  if (JSON.stringify(expectedTables) !== JSON.stringify(actualTables) || !expectedTables.length)
    throw new Error(`${station.name}: 公開されている駅時刻表の全件を取得できません。`);
  const routes = [];
  for (const table of stationTables) {
    if (table['odpt:calendar'] !== 'odpt.Calendar:Weekday') continue;
    if (table['odpt:railway'] === 'odpt.Railway:Toei.Asakusa' && managedAsakusa !== undefined) {
      const id = 'Toei.Asakusa.' + table['odpt:railDirection'].split(':').at(-1);
      const approved = managedAsakusa.filter(
        (r) => r.id === id && r.sourceStationId === table['odpt:station'],
      );
      if (approved.length !== 1) throw Error('Reviewed Asakusa route is missing or ambiguous');
      routes.push(structuredClone(approved[0]));
      continue;
    }
    const weekend = stationTables.find(
      (x) =>
        x['odpt:station'] === table['odpt:station'] &&
        x['odpt:railDirection'] === table['odpt:railDirection'] &&
        x['odpt:calendar'] === 'odpt.Calendar:SaturdayHoliday',
    );
    if (!weekend) throw new Error(`${station.name}: 土休日の時刻表がありません。`);
    const line = LINES[table['odpt:railway']];
    const directionId = table['odpt:railDirection'].split(':').at(-1);
    const railway = lookups.railways.find(
      (item) => item.id === table['odpt:railway'].split('.').at(-1),
    );
    if (!railway) throw new Error(`${station.name}: 路線情報がありません。`);
    const direction =
      railway?.id === 'Oedo'
        ? oedoDirection(station.id, directionId, railway, lookups)
        : line[directionId];
    const weekday = parseTimetable(table, lookups);
    const holiday = parseTimetable(weekend, lookups);
    if (!direction || !weekday.length || !holiday.length)
      throw new Error(`${station.name}: 方面・ダイヤが不足しています。`);
    routes.push({
      id: `${table['odpt:railway'].split(':').at(-1)}.${table['odpt:railDirection'].split(':').at(-1)}`,
      railwayId: railway.id,
      sourceStationId: table['odpt:station'],
      sourceTimetableIds: [table['owl:sameAs'], weekend['owl:sameAs']],
      sourceUpdated: new Date(
        Math.min(Date.parse(table['dc:date']), Date.parse(weekend['dc:date'])),
      ).toISOString(),
      line: line.name,
      direction,
      color: line.color,
      sourceUrl: TIMETABLE_SOURCE,
      schedules: { weekday, saturday: holiday, holiday },
    });
  }
  const expected = expectedTables.length / 2;
  if (routes.length !== expected)
    throw new Error(`${station.name}: 方面数が不正です (${routes.length}/${expected})。`);
  const dates = routes.map((x) => x.sourceUpdated).filter((x) => Number.isFinite(Date.parse(x)));
  if (!dates.length) throw new Error(`${station.name}: 更新日時がありません。`);
  return {
    ...station,
    sourceId: TOEI_OPERATOR,
    sourceUrl: TIMETABLE_SOURCE,
    sourceLicense: DATA_LICENSE,
    sourceProvider: DATA_PROVIDER,
    sourceUpdated: new Date(Math.min(...dates.map(Date.parse))).toISOString(),
    fetchedAt,
    routes,
  };
}

function oedoDirection(stationId, directionId, railway, lookups) {
  if (directionId === 'Toei.Hikarigaoka') return '光が丘';
  const order =
    directionId === 'InnerLoop' ? [...railway.stationIds].reverse() : railway.stationIds;
  if (!['InnerLoop', 'OuterLoop'].includes(directionId)) return undefined;
  // Tochomae occurs twice: departures use the start of each loop's journey.
  const current = order.indexOf(stationId);
  const remaining = order.slice(current + 1);
  const anchors = new Set([
    'shinjuku',
    'roppongi',
    'daimon',
    'ryogoku',
    'kasuga',
    'tochomae',
    'nerima',
    'hikarigaoka',
  ]);
  const next = remaining.filter((id) => anchors.has(id)).slice(0, 2);
  if (!next.length && remaining.length) next.push(remaining.at(-1));
  return next
    .map((id) => {
      const sourceId = [...lookups.names.keys()].find(
        (key) =>
          key.startsWith('odpt.Station:Toei.Oedo.') && key.split('.').at(-1).toLowerCase() === id,
      );
      return lookups.names.get(sourceId);
    })
    .join('・');
}

function serviceMinute(train) {
  const [h, m] = train.time.split(':').map(Number);
  return (h < 4 ? h + 24 : h) * 60 + m;
}
