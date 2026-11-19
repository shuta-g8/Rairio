import { STATIONS, RAILWAY_CATALOG } from '../generated/station-directory.ts';
import type { DirectoryStation as Station } from '../../shared/station-directory.ts';
export { STATIONS };

const stationsById = new Map(STATIONS.map((station) => [station.id, station]));
const stationsByName = new Map(STATIONS.map((station) => [station.name, station]));

export function findStation(id: string) {
  return stationsById.get(id);
}

export function stationDisplayName(
  station: Pick<Station, 'name' | 'secondaryName'> | string,
): string {
  const name = typeof station === 'string' ? station : station.name;
  const secondary =
    (typeof station === 'string' ? undefined : station.secondaryName) ||
    stationsByName.get(name)?.secondaryName;
  return secondary ? `${name}[${secondary}]` : name;
}
export const STATION_RAILWAYS = RAILWAY_CATALOG.map((railway) => ({
  ...railway,
  stations: railway.stationIds.map((id) => stationsById.get(id)!),
}));

export function stationRailwayId(stationId: string, preferred?: string): string {
  const lines = stationsById.get(stationId)?.memberships || [];
  return (
    lines.find((line) => line.railwayId === preferred)?.railwayId ||
    lines[0]?.railwayId ||
    STATION_RAILWAYS[0].id
  );
}

export function lineName(line: string): string {
  return line.replace('都営地下鉄', '都営').replace(/山手線(内回り|外回り)/, '山手線');
}

export function lineSymbol(line: string): string {
  if (line.includes('湘南新宿')) return 'JS';
  if (/西武.*(?:新宿|拝島)/.test(line)) return 'SS';
  if (line.includes('京王')) return line.includes('井の頭') ? 'IN' : 'KO';
  if (line.includes('浅草')) return 'A';
  if (line.includes('大江戸')) return 'E';
  if (line.includes('三田')) return 'I';
  if (line.includes('新宿')) return 'S';
  if (line.includes('池上')) return 'IK';
  if (line.includes('多摩川')) return 'TM';
  if (line.includes('東横')) return 'TY';
  if (line.includes('みなとみらい')) return 'MM';
  if (line.includes('ブルーライン')) return 'B';
  if (line.includes('銀座')) return 'G';
  if (line.includes('京急')) return 'KK';
  if (line.includes('相鉄')) return 'SO';
  if (line.includes('ゆりかもめ')) return 'U';
  if (line.includes('京浜東北') || line.includes('根岸')) return 'JK';
  if (line.includes('山手')) return 'JY';
  if (line.includes('横須賀')) return 'JO';
  if (line.includes('横浜線')) return 'JH';
  if (line.includes('南武')) return 'JN';
  if (line.includes('東海道')) return 'JT';
  return '';
}
