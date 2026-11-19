import { STATION_CATALOG } from './generated/station-catalog.ts';
export { RAILWAY_CATALOG, STATION_CATALOG_SOURCE } from './generated/station-catalog.ts';

export interface StationMembership {
  railwayId: string;
  sourceStationId: string;
  code: string;
  order: number[];
  latitude: number;
  longitude: number;
  address: string;
  manager: string;
  connectingStationIds: string[];
  connectingRailwayIds?: string[];
  timetableIds: string[];
  sourceUpdated: string;
  basicsUpdated: string;
}

export interface Station {
  id: string;
  name: string;
  english: string;
  area: string;
  sourceName?: string;
  reading?: string;
  aliases?: string[];
  memberships?: StationMembership[];
  secondaryName?: string;
  availableRailways?: { id: string; name: string }[];
  stationInfoUrl?: string;
}

export const STATIONS: Station[] = STATION_CATALOG;
