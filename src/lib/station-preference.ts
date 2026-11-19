import { findStation } from './stations.ts';
import { readStoredValue, writeStoredValue } from './storage.ts';

export const STATION_PREFERENCE_KEY = 'rairio:station:v1';
const DEFAULT_STATION_ID = 'shinjuku';

export function loadPreferredStation(): string {
  const saved = readStoredValue(STATION_PREFERENCE_KEY);
  return (saved && findStation(saved)?.id) || DEFAULT_STATION_ID;
}

export function savePreferredStation(id: string): void {
  writeStoredValue(STATION_PREFERENCE_KEY, id);
}
