import { findStation } from './stations.ts';

/** Keep valid, distinct station IDs in their original order. */
export function validStationIds(ids: unknown[], limit: number): string[] {
  return [
    ...new Set(ids.filter((id): id is string => typeof id === 'string' && !!findStation(id))),
  ].slice(0, limit);
}
