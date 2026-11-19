import { validStationIds } from './station-list.ts';
import { readStoredJson, writeStoredJson } from './storage.ts';

export const RECENT_STATIONS_KEY = 'rairio:recent-stations:v1';

function validRecentStations(ids: unknown[]): string[] {
  return validStationIds(ids, 3);
}

export function loadRecentStations(): string[] {
  return validRecentStations(readStoredJson<unknown[]>(RECENT_STATIONS_KEY, Array.isArray) || []);
}

export function rememberRecentStation(id: string, previous: string[]): string[] {
  const ids = validRecentStations([id, ...previous]);
  writeStoredJson(RECENT_STATIONS_KEY, ids);
  return ids;
}
