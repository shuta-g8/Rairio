import type { JourneyData } from '../../shared/journey.ts';
import type { Journey } from './journey.ts';
import type { GuidanceConnection } from './journey-guidance.ts';
import { KANTO_NETWORK, NETWORK_STATIONS, networkPathsTo } from './kanto-network.ts';
import { STATIONS } from './stations.ts';

export interface RankedJourney {
  journey?: Journey;
  guidance?: GuidanceConnection;
  boundary?: string;
}
export function journeyTransferCount(option: RankedJourney): number {
  const knownRides = option.journey?.legs.filter((leg) => leg.kind === 'ride').length ?? 0;
  const otherRides = option.guidance ? (option.guidance.segments?.length ?? 1) : 0;
  return Math.max(0, knownRides + otherRides - 1);
}
const distance = (a: string, b: string) => {
  const x = NETWORK_STATIONS.get(KANTO_NETWORK.toei[a]),
    y = NETWORK_STATIONS.get(KANTO_NETWORK.toei[b]);
  return x && y ? Math.hypot((x.lat - y.lat) * 111, (x.lon - y.lon) * 91) : 0;
};
function knownScore(data: JourneyData, journey: Journey): number {
  let score = 0;
  for (const leg of journey.legs) {
    if (leg.kind !== 'ride') continue;
    score += 3;
    const trip = data.trips.find((t) => t.id === leg.trip);
    const from = trip?.stops.findIndex((s) => s[0] === leg.from && s[2] === leg.departure) ?? -1;
    const to =
      trip?.stops.findIndex((s, i) => i > from && s[0] === leg.to && s[1] === leg.arrival) ?? -1;
    if (!trip || from < 0 || to < 0) {
      score += distance(data.stops[leg.from].station, data.stops[leg.to].station);
      continue;
    }
    for (let i = from; i < to; i++)
      score += distance(
        data.stops[trip.stops[i][0]].station,
        data.stops[trip.stops[i + 1][0]].station,
      );
  }
  return score;
}

/** Hide Toei detours instead of merely moving them below a reasonable alternative. */
export function excludeClearDetours(data: JourneyData, options: RankedJourney[]): RankedJourney[] {
  const score = (option: RankedJourney): number | undefined => {
    if (option.guidance && option.guidance.score === undefined) return undefined;
    return (option.journey ? knownScore(data, option.journey) : 0) + (option.guidance?.score ?? 0);
  };
  const scores = options.map(score);
  const best = Math.min(
    ...scores.filter((value): value is number => value !== undefined && value > 0),
  );
  if (!Number.isFinite(best)) return options;
  return options.filter(
    (option, index) =>
      !option.journey || scores[index] === undefined || best >= scores[index]! * 0.8,
  );
}

/** Both endpoints can be Toei stations while the useful journey uses JR/private lines. */
export function rankStationJourneys(
  data: JourneyData,
  journeys: Journey[],
  from: string,
  to: string,
): RankedJourney[] {
  const detailed = journeys.map((journey) => ({ journey }));
  const source = KANTO_NETWORK.toei[from],
    target = KANTO_NETWORK.toei[to];
  if (!source || !target || source === target) return detailed;
  const path = networkPathsTo(target).get(source);
  if (!path?.segments.length) return detailed;
  const first = path.segments[0],
    last = path.segments.at(-1)!;
  const toName = STATIONS.find((s) => s.id === to)?.name;
  const guidance: GuidanceConnection = {
    station: from,
    line: first.line,
    from: first.from,
    to: last.to,
    segments: path.segments,
    changes: path.changes,
    distance: path.distance,
    score: path.score,
    walkTo: toName !== last.to ? toName : undefined,
  };
  const alternative: RankedJourney = { guidance, boundary: from };
  // Promote an untimed alternative only when it is clearly simpler/shorter.
  // Small geometric differences never displace an exact Toei timetable result.
  const firstDetailed = journeys[0];
  if (!firstDetailed || path.score < knownScore(data, firstDetailed) * 0.8)
    return excludeClearDetours(data, [alternative, ...detailed]);
  return excludeClearDetours(data, [...detailed, alternative]);
}
