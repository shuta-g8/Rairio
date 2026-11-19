import { validStationIds } from './station-list.ts';
import { readStoredJson, writeStoredJson } from './storage.ts';

export const SAVED_STATIONS_KEY = 'rairio:saved-stations:v1';
export const MAX_SAVED_STATIONS = 5;

export function validSavedStations(value: unknown[]): string[] {
  return validStationIds(value, MAX_SAVED_STATIONS);
}

export function loadSavedStations(): string[] {
  return validSavedStations(readStoredJson<unknown[]>(SAVED_STATIONS_KEY, Array.isArray) || []);
}

export function storeSavedStations(ids: string[]): void {
  writeStoredJson(SAVED_STATIONS_KEY, validSavedStations(ids));
}

export function addSavedStation(ids: string[], id: string): string[] {
  const next = validSavedStations([...ids, id]);
  return next.length === ids.length && next.every((value, index) => value === ids[index])
    ? ids
    : next;
}
