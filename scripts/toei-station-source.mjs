import { TOEI_OPERATOR, STATION_BASICS_SOURCE } from '../shared/transit-source.ts';
import { readFileSync } from 'node:fs';
import {
  STATION_SUBNAMES,
  GUIDANCE_RAILWAY_NAMES,
  GUIDANCE_RAILWAY_GROUPS,
  ADDITIONAL_STATION_RAILWAYS,
} from '../shared/station-guidance.ts';

const stationPages = JSON.parse(
  readFileSync(
    new URL('../public/metadata/station-guidance-sources.json', import.meta.url),
    'utf8',
  ),
).stationPages;

export const SUBWAY_LINES = ['Asakusa', 'Mita', 'Shinjuku', 'Oedo'];

// The official CSV has a title and blank row before the column headings.
export function parseStationBasics(text) {
  const rows = [];
  let row = [];
  let value = '';
  let quoted = false;
  for (let index = 0; index < text.length; index++) {
    const char = text[index];
    if (char === '"') {
      if (quoted && text[index + 1] === '"') {
        value += '"';
        index++;
      } else quoted = !quoted;
    } else if (!quoted && (char === ',' || char === '\n')) {
      row.push(value.replace(/\r$/, '').trim());
      value = '';
      if (char === '\n') {
        rows.push(row);
        row = [];
      }
    } else value += char;
  }
  if (quoted) throw new Error('駅基本情報CSVの引用符が閉じていません。');
  if (value || row.length) rows.push([...row, value.replace(/\r$/, '').trim()]);
  const header = rows.findIndex((item) => item.includes('駅ナンバー') && item.includes('よみ'));
  if (header < 0) throw new Error('駅基本情報CSVの見出しがありません。');
  return rows
    .slice(header + 1)
    .filter((item) => /^\d+$/.test(item[0]))
    .map((item) => Object.fromEntries(rows[header].map((key, index) => [key, item[index]])));
}

export function createStationCatalog(rawStations, rawRailways, basics) {
  const stationsBySource = new Map(
    rawStations
      .filter((row) => row['odpt:operator'] === TOEI_OPERATOR)
      .map((row) => [row['owl:sameAs'], row]),
  );
  const basicsByCode = new Map(basics.map((row) => [row['駅ナンバー'], row]));
  const stations = new Map();
  const railways = [];
  for (const lineId of SUBWAY_LINES) {
    const railway = rawRailways.find(
      (row) =>
        row['odpt:operator'] === TOEI_OPERATOR &&
        row['owl:sameAs'] === `odpt.Railway:Toei.${lineId}`,
    );
    if (!railway?.['odpt:stationOrder']?.length)
      throw new Error(`${lineId}: 路線の駅順がありません。`);
    const order = [...railway['odpt:stationOrder']].sort(
      (a, b) => a['odpt:index'] - b['odpt:index'],
    );
    const stationIds = [];
    for (const stop of order) {
      const sourceId = stop['odpt:station'];
      const source = stationsBySource.get(sourceId);
      const basic = basicsByCode.get(source?.['odpt:stationCode']);
      // The published basic-information CSV spells 本蓮沼 with a trailing period.
      if (
        !source ||
        !basic ||
        basic['駅名'].replace(/\.$/, '') !== source['odpt:stationTitle']?.ja ||
        !basic['よみ']
      )
        throw new Error(`${sourceId}: 駅名・駅番号・よみを公式データで照合できません。`);
      const id = sourceId.split('.').at(-1).toLowerCase();
      const name = source['odpt:stationTitle'].ja;
      const area = basic['住所'].match(/^(東京都|千葉県)(.+?[区市町村])/);
      if (!area || !Number.isFinite(source['geo:lat']) || !Number.isFinite(source['geo:long']))
        throw new Error(`${name}: 所在地・座標がありません。`);
      if (!stations.has(id))
        stations.set(id, {
          id,
          name,
          english: source['odpt:stationTitle'].en,
          reading: basic['よみ'],
          area: `${area[1]} ${area[2]}`,
          ...(id === 'shimbashi' ? { aliases: ['Shinbashi'] } : {}),
          memberships: [],
        });
      const station = stations.get(id);
      if (station.name !== name) throw new Error(`駅IDが重複しています: ${id}`);
      const membership = station.memberships.find((item) => item.railwayId === lineId);
      if (membership) membership.order.push(stop['odpt:index']);
      else
        station.memberships.push({
          railwayId: lineId,
          sourceStationId: sourceId,
          code: source['odpt:stationCode'],
          order: [stop['odpt:index']],
          latitude: source['geo:lat'],
          longitude: source['geo:long'],
          address: basic['住所'],
          manager: basic['駅管理者'],
          connectingStationIds: source['odpt:connectingStation'] || [],
          connectingRailwayIds: source['odpt:connectingRailway'] || [],
          timetableIds: source['odpt:stationTimetable'] || [],
          sourceUpdated: source['dc:date'],
          basicsUpdated: basic['情報更新日'],
        });
      stationIds.push(id);
    }
    railways.push({
      id: lineId,
      name: `都営${railway['odpt:railwayTitle'].ja}`,
      english: railway['odpt:railwayTitle'].en,
      code: railway['odpt:lineCode'],
      color: railway['odpt:color'].toLowerCase(),
      stationIds,
      ascendingDirection: railway['odpt:ascendingRailDirection'],
      descendingDirection: railway['odpt:descendingRailDirection'],
      sourceUpdated: railway['dc:date'],
    });
  }
  const memberships = [...stations.values()].flatMap((station) => station.memberships);
  const subwayStations = rawStations.filter(
    (row) =>
      row['odpt:operator'] === TOEI_OPERATOR &&
      SUBWAY_LINES.some((line) => row['odpt:railway'] === `odpt.Railway:Toei.${line}`),
  );
  if (memberships.length !== basics.length || memberships.length !== subwayStations.length)
    throw new Error('路線・駅情報・駅基本情報の全件数が一致しません。');
  for (const station of stations.values()) {
    const subname = STATION_SUBNAMES[station.id];
    if (subname) {
      station.secondaryName = subname.name;
      station.aliases = [...(station.aliases || []), subname.name, ...subname.aliases];
    }
    const page = stationPages.find((page) => page.id === station.id);
    if (!page) throw new Error(`${station.name}: 乗換案内の確認元がありません。`);
    station.stationInfoUrl = page.url;
    const ids = [
      ...station.memberships.map((member) => `Toei.${member.railwayId}`),
      ...station.memberships.flatMap((member) =>
        member.connectingRailwayIds.map((id) => id.replace(/^odpt\.Railway:/, '')),
      ),
      ...(ADDITIONAL_STATION_RAILWAYS[station.id] || []).map((line) => line.id),
    ].map((id) => GUIDANCE_RAILWAY_GROUPS[id] || id);
    station.availableRailways = [...new Set(ids)].map((id) => {
      const name = GUIDANCE_RAILWAY_NAMES[id];
      if (!name) throw new Error(`${station.name}: 未登録の接続路線です: ${id}`);
      return { id, name };
    });
  }
  return { stations: [...stations.values()], railways, basicsSource: STATION_BASICS_SOURCE };
}
