import { schedulesForDate, timetableEditionForDate } from '../../shared/timetable-editions.ts';
import { THROUGH_STATIONS } from '../../shared/toei-through-station-names.ts';
import {
  trainPositionIsFresh,
  type TrainPosition,
  type TrainPositionsSnapshot,
} from '../../shared/train-positions.ts';
import type { Route, StationData, Train } from '../types.ts';
import { departureTimestamp, serviceDate, timetableDay } from './time.ts';
import { toeiRouteStations, toeiStopGuide, type ToeiStopGuide } from './toei-stops.ts';
import { toeiThroughDestinationCode } from './toei-through-destinations.ts';

export interface ToeiSpecialCall {
  kind: 'pass' | 'terminates';
  trainId: string;
  at: number;
  expiresAt: number;
  beforeApproach?: true;
}

type StationOrder = NonNullable<ReturnType<typeof toeiRouteStations>>;
type Candidate = Pick<ToeiSpecialCall, 'kind' | 'expiresAt'> & {
  position: TrainPosition;
  sourceAt: number;
  destination: string;
  upstream: string;
  downstream?: string;
  stationsBefore: number;
  stationsAfter: number;
  beforeApproach: boolean;
  earlierVisitDepartures?: number[];
};

const MINUTE = 60_000;
const SPECIAL_CALL_MAX_AGE = 45_000;
const MAX_BETWEEN_SCHEDULED_STOPS = 15 * MINUTE;
const MIN_OEDO_LOOP_VISIT_GAP = 30 * MINUTE;
const EXPRESS_WITH_SKIPPED_STOPS: Readonly<Record<string, string>> = {
  Asakusa: 'エアポート快特',
  Shinjuku: '急行',
};

const THROUGH_OPERATORS: Readonly<Record<string, string>> = {
  HS: 'Hokuso',
  KK: 'Keikyu',
  KO: 'Keio',
  KS: 'Keisei',
  MG: 'Tokyu',
  SH: 'Tokyu',
  SO: 'Sotetsu',
  SR: 'Shibayama',
};

function stationId(prefix: string, sourceId: string) {
  return sourceId.startsWith(prefix) ? sourceId.slice(prefix.length).toLowerCase() : undefined;
}

function destinationName(route: Route, order: StationOrder, prefix: string, id: string) {
  const local = stationId(prefix, id);
  if (local) return order.find((station) => station.id === local)?.name;
  const foreign = /^odpt\.Station:([A-Za-z]+)\.[\w.]+\.(\w+)$/.exec(id);
  if (!foreign || !Object.hasOwn(THROUGH_STATIONS, foreign[2])) return;
  const name = THROUGH_STATIONS[foreign[2]];
  const code = toeiThroughDestinationCode(route, name)?.split('-')[0];
  if (code && THROUGH_OPERATORS[code] === foreign[1]) return name;
}

function approachingStation(
  order: StationOrder,
  current: string,
  from: string,
  to: string | undefined,
  terminal: boolean,
) {
  const visits = order.flatMap((station, index) => (station.id === current ? [index] : []));
  const visit = visits.length === 1 ? visits[0] : -1;
  const previous = order[visit - 1]?.id;
  if (!to) {
    if (visit <= 0) return;
    // ODPT can report the vicinity of a station as a station ID with no next station,
    // even for a through train. The timetables still have to corroborate the pass.
    if (from === current) return { from: visit - 1, current: visit, to: visit };
    if (from === previous && order.filter((station) => station.id === from).length === 1)
      return { from: visit - 1, current: visit, to: visit - 1 };
    return;
  }
  if (from === current) return;
  if (terminal && visit >= 2 && to === previous && from === order[visit - 2].id)
    return { from: visit - 2, current: visit, to: visit - 1 };
  const matches = visits.flatMap((visit) => {
    // ODPT may place a train on a segment that spans more than one station.
    const start = Math.max(0, visit - 2);
    const before = order
      .slice(start, visit)
      .map((s) => s.id)
      .lastIndexOf(from);
    const after = order.slice(visit, visit + 3).findIndex((s) => s.id === to);
    if (before < 0 || after < 0 || (terminal && after !== 0)) return [];
    return [{ from: start + before, current: visit, to: visit + after }];
  });
  return matches.length === 1 ? matches[0] : undefined;
}

function describesCall(guide: ToeiStopGuide | undefined, current: string, terminal: boolean) {
  if (!guide) return false;
  if (terminal) return !guide.through && guide.stations.at(-1)?.id === current;
  return guide.stations.some((station) => station.id === current && station.kind === 'pass');
}

function candidates(route: Route, positions: TrainPositionsSnapshot | null | undefined, now: Date) {
  const nowMs = now.getTime();
  if (!positions || !Number.isFinite(nowMs)) return [];
  const fetchedAt = Date.parse(positions.fetchedAt);
  if (!(fetchedAt <= nowMs && fetchedAt > nowMs - SPECIAL_CALL_MAX_AGE)) return [];
  const date = serviceDate(now);
  const timetable = schedulesForDate(route, date)?.[timetableDay(route, date)];
  const order = toeiRouteStations(route);
  const prefix = `odpt.Station:Toei.${route.railwayId}.`;
  const current = stationId(prefix, route.sourceStationId ?? '');
  if (!Array.isArray(timetable) || !order || !current) return [];
  const direction = route.id.slice(`Toei.${route.railwayId}.`.length);
  const scheduledIds = new Set(timetable.map((train) => train?.trainId));
  const timesSeen = new Map<string, number>();
  for (const position of positions.trains)
    timesSeen.set(position.id, (timesSeen.get(position.id) ?? 0) + 1);

  const result: Candidate[] = [];
  for (const position of positions.trains) {
    const { trainType, destinationStation } = position;
    const sourceAt = Date.parse(position.updatedAt);
    if (
      timesSeen.get(position.id) !== 1 ||
      !position.id.startsWith(`odpt.Train:Toei.${route.railwayId}.`) ||
      position.railwayId !== route.railwayId ||
      position.direction !== direction ||
      !trainType ||
      !destinationStation ||
      sourceAt > fetchedAt ||
      sourceAt <= nowMs - SPECIAL_CALL_MAX_AGE ||
      !trainPositionIsFresh(position, nowMs) ||
      serviceDate(new Date(sourceAt)) !== date
    )
      continue;
    const terminal = destinationStation === route.sourceStationId;
    const hasScheduledDeparture = scheduledIds.has(position.id);
    if (hasScheduledDeparture && !terminal) continue;
    if (!terminal && trainType !== EXPRESS_WITH_SKIPPED_STOPS[position.railwayId]) continue;
    const destination = destinationName(route, order, prefix, destinationStation);
    const from = stationId(prefix, position.fromStation);
    const to = position.toStation ? stationId(prefix, position.toStation) : undefined;
    if (!destination || !from || (position.toStation !== null && !to)) continue;
    const movement = approachingStation(order, current, from, to, terminal);
    if (!movement) continue;
    let earlierVisitDepartures: number[] | undefined;
    if (hasScheduledDeparture) {
      // An inner-loop train can depart Tochomae once before returning to terminate there.
      if (
        route.id !== 'Toei.Oedo.InnerLoop' ||
        to !== current ||
        movement.current !== order.length - 1 ||
        !order.slice(0, movement.current).some((station) => station.id === current)
      )
        continue;
      earlierVisitDepartures = timetable
        .filter((train) => train?.trainId === position.id)
        .map((train) => scheduledTimestamp(date, train));
    }

    // Find the nearest stopping station before the reported segment using the
    // published stop pattern. The actual schedule is checked separately below.
    const beforeApproach = terminal && movement.to < movement.current;
    const start = beforeApproach ? movement.current - 1 : movement.from;
    const end = beforeApproach ? start : 0;
    for (let index = start; index >= end; index--) {
      const upstream = order[index].id;
      const guide = toeiStopGuide(
        { ...route, sourceStationId: prefix + upstream },
        { destination, type: trainType },
      );
      if (!guide || !describesCall(guide, current, terminal)) continue;
      const next = guide.stations
        .slice(movement.current - index + 1)
        .find((station) => station.kind === 'stop');
      const nextIndex = next ? order.findIndex((station) => station.id === next.id) : -1;
      if (!terminal && nextIndex < movement.to) break;
      result.push({
        kind: terminal ? 'terminates' : 'pass',
        position,
        sourceAt,
        destination,
        upstream,
        downstream: terminal ? undefined : next?.id,
        stationsBefore: movement.current - index,
        stationsAfter: terminal ? 0 : nextIndex - movement.current,
        beforeApproach,
        earlierVisitDepartures,
        expiresAt: Math.min(Date.parse(position.validUntil), sourceAt + SPECIAL_CALL_MAX_AGE),
      });
      break;
    }
  }
  return result;
}

/** Load only the scheduled stopping points that could corroborate an observed movement. */
export function toeiSpecialCallStationIds(
  route: Route,
  positions: TrainPositionsSnapshot | null | undefined,
  now: Date,
): string[] {
  return [
    ...new Set(
      candidates(route, positions, now).flatMap(({ upstream, downstream }) =>
        downstream ? [upstream, downstream] : [upstream],
      ),
    ),
  ];
}

function matchingAnchor(
  route: Route,
  station: StationData | undefined,
  stationId: string,
  date: string,
  candidate: Candidate,
) {
  if (station?.id !== stationId || !Array.isArray(station.routes)) return;
  const matchingRoutes = station.routes.filter(
    (other) =>
      typeof other?.sourceStationId === 'string' &&
      other.id === route.id &&
      other.railwayId === route.railwayId &&
      other.sourceStationId.startsWith(`odpt.Station:Toei.${route.railwayId}.`) &&
      other.sourceStationId.split('.').at(-1)?.toLowerCase() === stationId,
  );
  if (matchingRoutes.length !== 1) return;
  const anchor = matchingRoutes[0];
  if (route.railwayId === 'Asakusa') {
    // Loaded neighboring editions come from the existing manifest verifier.
    if (
      !Array.isArray(anchor.timetableEditions) ||
      anchor.timetableEditions.some((entry) => !entry)
    )
      return;
    const currentEdition = timetableEditionForDate(route, date);
    const anchorEdition = timetableEditionForDate(anchor, date);
    if (
      !currentEdition ||
      !anchorEdition ||
      currentEdition.id !== anchorEdition.id ||
      currentEdition.gtfs?.sha256 !== anchorEdition.gtfs?.sha256
    )
      return;
  } else if (
    !Number.isFinite(Date.parse(route.sourceUpdated ?? '')) ||
    route.sourceUpdated !== anchor.sourceUpdated
  )
    return;
  const entries = schedulesForDate(anchor, date)?.[timetableDay(route, date)];
  if (!Array.isArray(entries)) return;
  const matchingTrains = entries.filter((train) => train?.trainId === candidate.position.id);
  if (matchingTrains.length !== 1) return;
  const train = matchingTrains[0];
  if (train.type !== candidate.position.trainType || train.destination !== candidate.destination)
    return;
  const timestamp = scheduledTimestamp(date, train);
  if (!Number.isFinite(timestamp)) return;
  return { route: anchor, train, timestamp };
}

function scheduledTimestamp(date: string, train: Train) {
  return typeof train.time === 'string' && /^\d{2}:[0-5]\d$/.test(train.time)
    ? departureTimestamp(date, train.time, train.dayOffset)
    : NaN;
}

function uniqueDepartures(entries: Train[]) {
  const unique = new Map<string, Train | undefined>();
  for (const entry of entries) {
    if (!entry?.trainId) continue;
    unique.set(entry.trainId, unique.has(entry.trainId) ? undefined : entry);
  }
  return unique;
}

/** Infer the order of an early terminal call from comparable, nearby runs on the same segment. */
function terminalTravelTime(
  route: Route,
  before: NonNullable<ReturnType<typeof matchingAnchor>>,
  date: string,
) {
  const day = timetableDay(route, date);
  const atPrevious = schedulesForDate(before.route, date)?.[day];
  const atTarget = schedulesForDate(route, date)?.[day];
  if (!Array.isArray(atPrevious) || !Array.isArray(atTarget)) return;

  const previousDepartures = uniqueDepartures(atPrevious);
  const samples = [];
  for (const [trainId, arrivalSide] of uniqueDepartures(atTarget)) {
    const departureSide = previousDepartures.get(trainId);
    if (
      !arrivalSide ||
      !departureSide ||
      arrivalSide.type !== before.train.type ||
      arrivalSide.type !== departureSide.type ||
      arrivalSide.destination !== departureSide.destination ||
      departureSide.destination === before.train.destination
    )
      continue;
    const departure = scheduledTimestamp(date, departureSide);
    const elapsed = scheduledTimestamp(date, arrivalSide) - departure;
    const distance = Math.abs(departure - before.timestamp);
    if (elapsed >= MINUTE && elapsed <= 4 * MINUTE && distance <= 60 * MINUTE)
      samples.push({ elapsed, distance });
  }
  const nearby = samples
    .sort((a, b) => a.distance - b.distance)
    .slice(0, 5)
    .map(({ elapsed }) => elapsed)
    .sort((a, b) => a - b);
  if (!nearby.length) return;
  const middle = (nearby.length - 1) / 2;
  return (nearby[Math.floor(middle)] + nearby[Math.ceil(middle)]) / 2;
}

/** Match exceptional calls without creating a passenger departure from live data. */
export function resolveToeiSpecialCalls(
  route: Route,
  positions: TrainPositionsSnapshot | null | undefined,
  now: Date,
  neighbors: ReadonlyMap<string, StationData>,
): ToeiSpecialCall[] {
  const prospective = candidates(route, positions, now);
  if (!prospective.length) return [];
  const date = serviceDate(now);
  const current = route.sourceStationId!.split('.').at(-1)!.toLowerCase();
  const singleVisit =
    toeiRouteStations(route)?.filter((station) => station.id === current).length === 1;
  const calls: ToeiSpecialCall[] = [];
  for (const candidate of prospective) {
    const { kind, position, upstream, downstream, sourceAt, expiresAt } = candidate;
    const before = matchingAnchor(route, neighbors.get(upstream), upstream, date, candidate);
    if (!before) continue;
    if (
      candidate.earlierVisitDepartures?.some(
        (at) => !Number.isFinite(at) || before.timestamp - at < MIN_OEDO_LOOP_VISIT_GAP,
      )
    )
      continue;
    const guide = toeiStopGuide(before.route, before.train);
    if (!describesCall(guide, current, !downstream)) continue;
    const delay = (position.delay ?? 0) * 1000;
    if (!Number.isFinite(delay) || delay < 0) continue;
    const earliest = before.timestamp + delay;
    const lead = candidate.beforeApproach ? 3 * MINUTE : MINUTE;
    if (sourceAt < earliest - lead) continue;
    let at = sourceAt;
    if (downstream) {
      const next = guide!.stations
        .slice(candidate.stationsBefore + 1)
        .find((station) => station.kind === 'stop');
      if (next?.id !== downstream) continue;
      const after = matchingAnchor(route, neighbors.get(downstream), downstream, date, candidate);
      if (!after) continue;
      const interval = after.timestamp - before.timestamp;
      const { stationsBefore, stationsAfter } = candidate;
      if (
        interval <= 0 ||
        interval > MAX_BETWEEN_SCHEDULED_STOPS ||
        sourceAt > after.timestamp + delay + MINUTE
      )
        continue;
      at = Math.max(
        sourceAt,
        earliest + (interval * stationsBefore) / (stationsBefore + stationsAfter),
      );
    } else {
      if (sourceAt > earliest + 4 * MINUTE * candidate.stationsBefore) continue;
      const travel =
        singleVisit && candidate.stationsBefore === 1
          ? terminalTravelTime(route, before, date)
          : undefined;
      if (candidate.beforeApproach && travel === undefined) continue;
      // A newer sample confirms eligibility; its timestamp is not a new arrival estimate.
      if (travel !== undefined) at = earliest + travel;
    }
    calls.push({
      kind,
      trainId: position.id,
      expiresAt,
      at,
      ...(candidate.beforeApproach && { beforeApproach: true }),
    });
  }
  return calls.sort((a, b) => a.at - b.at || a.trainId.localeCompare(b.trainId));
}
