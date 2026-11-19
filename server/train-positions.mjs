import {
  TRAIN_POSITIONS_SOURCE,
  TRAIN_POSITIONS_INTERVAL,
  trainPositionIsFresh,
} from '../shared/train-positions.ts';
import { TOEI_OPERATOR } from '../shared/transit-source.ts';

export function parseTrainPositions(data, fetchedAt = new Date().toISOString()) {
  if (!Array.isArray(data)) throw new Error('Invalid train positions');
  const now = Date.parse(fetchedAt);
  const trains = data
    .filter((entry) => {
      const railway = entry['odpt:railway']?.replace('odpt.Railway:Toei.', '');
      const prefix = `odpt.Station:Toei.${railway}.`;
      return (
        entry['odpt:operator'] === TOEI_OPERATOR &&
        ['Asakusa', 'Mita', 'Shinjuku', 'Oedo'].includes(railway) &&
        typeof entry['owl:sameAs'] === 'string' &&
        entry['owl:sameAs'].startsWith(`odpt.Train:Toei.${railway}.`) &&
        typeof entry['odpt:railDirection'] === 'string' &&
        typeof entry['odpt:fromStation'] === 'string' &&
        entry['odpt:fromStation'].startsWith(prefix) &&
        (entry['odpt:toStation'] === null ||
          (typeof entry['odpt:toStation'] === 'string' &&
            entry['odpt:toStation'].startsWith(prefix))) &&
        trainPositionIsFresh({ updatedAt: entry['dc:date'], validUntil: entry['dct:valid'] }, now)
      );
    })
    .map((entry) => ({
      id: entry['owl:sameAs'],
      railwayId: entry['odpt:railway'].replace('odpt.Railway:Toei.', ''),
      direction: entry['odpt:railDirection'].replace('odpt.RailDirection:', ''),
      fromStation: entry['odpt:fromStation'],
      toStation: entry['odpt:toStation'],
      updatedAt: entry['dc:date'],
      validUntil: entry['dct:valid'],
      ...(Number.isFinite(entry['odpt:delay']) && entry['odpt:delay'] >= 0
        ? { delay: entry['odpt:delay'] }
        : {}),
    }));
  return { fetchedAt, trains };
}

export function createTrainPositionsProvider({ fetchImpl = fetch, now = Date.now } = {}) {
  let snapshot = null;
  let pending = null;
  let cacheUntil = 0;
  const withRefreshDelay = (value) => ({
    ...value,
    refreshAfterMs: Math.max(0, Math.min(TRAIN_POSITIONS_INTERVAL, cacheUntil - now())),
  });
  const refresh = async () => {
    const startedAt = now();
    try {
      const response = await fetchImpl(TRAIN_POSITIONS_SOURCE, {
        redirect: 'manual',
        signal: AbortSignal.timeout(8000),
      });
      if (!response.ok) throw new Error('Train positions unavailable');
      snapshot = parseTrainPositions(await response.json(), new Date(now()).toISOString());
      // Count the same 30-second cycle from fetch start on both sides.
      // Counting from completion makes an on-time client hit the old cache.
      cacheUntil = startedAt + TRAIN_POSITIONS_INTERVAL;
    } catch (error) {
      snapshot = null;
      cacheUntil = 0;
      throw error;
    }
  };
  return {
    async get() {
      if (!snapshot || now() >= cacheUntil) {
        pending ??= refresh().finally(() => {
          pending = null;
        });
        await pending;
      }
      return withRefreshDelay(snapshot);
    },
  };
}
