import { JOURNEY_PLACES } from './journey-place-search.ts';
import { readStoredJson, writeStoredJson } from './storage.ts';

export const JOURNEY_HISTORY_KEY = 'rairio:journey:recent-stations:v1';
const known = new Set(JOURNEY_PLACES.map((p) => p.id));
export function validJourneyHistory(ids: unknown[]): string[] {
  return [
    ...new Set(ids.filter((id): id is string => typeof id === 'string' && known.has(id))),
  ].slice(0, 5);
}
export function loadJourneyHistory(): string[] {
  return validJourneyHistory(readStoredJson<unknown[]>(JOURNEY_HISTORY_KEY, Array.isArray) || []);
}
export function rememberJourneyPlace(id: string, previous: string[]): string[] {
  const ids = validJourneyHistory([id, ...previous]);
  writeStoredJson(JOURNEY_HISTORY_KEY, ids);
  return ids;
}
