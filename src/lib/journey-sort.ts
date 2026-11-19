import type { RankedJourney } from './journey-ranking.ts';

export type JourneySort = 'arrival' | 'toei';

/** A Toei segment's arrival is never the arrival time of the complete mixed route. */
export function completeJourneyArrival(result: RankedJourney, inbound = false) {
  return !inbound && !result.guidance ? result.journey?.arrival : undefined;
}

export function sortJourneyOptions(
  results: readonly RankedJourney[],
  sort: JourneySort,
  inbound = false,
) {
  const toeiPriority = (result: RankedJourney) => (result.journey ? (result.guidance ? 1 : 0) : 2);
  return [...results].sort((a, b) => {
    if (sort === 'toei') {
      const priority = toeiPriority(a) - toeiPriority(b);
      if (priority) return priority;
    }
    const left = completeJourneyArrival(a, inbound);
    const right = completeJourneyArrival(b, inbound);
    if (left === undefined) return right === undefined ? 0 : 1;
    return right === undefined ? -1 : left - right;
  });
}
