import type { Departure, Route } from '../types.ts';
import {
  trainPositionIsFresh,
  TRAIN_POSITION_MAX_AGE,
  type TrainPosition,
  type TrainPositionsSnapshot,
  type CollectedTrainPosition,
} from '../../shared/train-positions.ts';
import { serviceDate } from './time.ts';
import {
  estimatePosition,
  positionAdvanceAt,
  type PositionEstimate,
} from '../../shared/position-estimate.ts';
import { toeiRouteStations, toeiStopGuide } from './toei-stops.ts';
import { schedulesForDate } from '../../shared/timetable-editions.ts';

export type TrainStationProgress = 'before' | 'approaching' | 'here' | 'departed';

function stationLocation(
  route: Route,
  position: TrainPosition | undefined,
): { progress: TrainStationProgress; coordinate: number } | undefined {
  if (!position || !route.sourceStationId) return;
  const order = toeiRouteStations(route);
  if (!order) return;
  const prefix = route.sourceStationId.slice(0, route.sourceStationId.lastIndexOf('.') + 1);
  // The loop's Tochomae occurs twice. Resolve a segment from both endpoints,
  // never from the first occurrence of the from-station alone.
  const indices = (id: string | null) =>
    id?.startsWith(prefix)
      ? order.flatMap((station, index) =>
          station.id === id.split('.').at(-1)!.toLowerCase() ? [index] : [],
        )
      : [];
  const origin = indices(route.sourceStationId)[0];
  if (origin === undefined) return;
  if (
    route.id === 'Toei.Oedo.Toei.Hikarigaoka' &&
    position.fromStation === 'odpt.Station:Toei.Oedo.Shinjuku' &&
    position.toStation === route.sourceStationId
  )
    return { progress: 'approaching', coordinate: -0.5 };
  const from = indices(position.fromStation);
  if (position.toStation === null) {
    if (position.fromStation === route.sourceStationId) return { progress: 'here', coordinate: 0 };
    // A bare observation at a repeated junction does not identify its visit.
    if (from.length !== 1) return;
    const coordinate = from[0] - origin;
    return { progress: coordinate > 0 ? 'departed' : 'before', coordinate };
  }
  const to = indices(position.toStation);
  const segments = from.flatMap((start) =>
    to.filter((end) => end > start).map((end) => ({ start, end })),
  );
  segments.sort((a, b) => a.end - a.start - (b.end - b.start));
  const segment = segments[0];
  if (!segment) return;
  const coordinate = segment.start + 0.5 - origin;
  return {
    progress: segment.end === origin ? 'approaching' : coordinate > 0 ? 'departed' : 'before',
    coordinate,
  };
}

export interface ToeiObservedPosition {
  stage: 'before-previous' | 'previous' | 'here';
  description: string;
  segment: 'first' | 'second' | 'both' | null;
  updatedAt: string;
  estimated?: boolean;
}

/** The reader and route order use the same directed visit index, including the Oedo loop. */
const departureVisits = new WeakMap<Route, number | null>();
function departureVisit(route: Route) {
  if (!departureVisits.has(route)) {
    const order = toeiRouteStations(route);
    const source = route.sourceStationId?.split('.').at(-1)?.toLowerCase();
    const visits = order?.flatMap((s, i) => (s.id === source && i + 1 < order.length ? [i] : []));
    // Tochomae's OuterLoop board dispatches toward Kasuga from the first visit.
    // The later departure toward Hikarigaoka has its own direction and board.
    const outerOrigin = route.id === 'Toei.Oedo.OuterLoop' && source === 'tochomae';
    departureVisits.set(route, visits && (visits.length === 1 || outerOrigin) ? visits[0] : null);
  }
  return departureVisits.get(route);
}

function estimatedStationProgress(
  route: Route,
  estimate: Pick<PositionEstimate, 'visit' | 'toStation'>,
): TrainStationProgress | undefined {
  const visit = departureVisit(route);
  if (visit == null) return;
  if (estimate.visit > visit) return 'departed';
  if (estimate.visit === visit) return 'here';
  return estimate.toStation === route.sourceStationId ? 'approaching' : 'before';
}

/** Use the same run and directed visit for the diagram, arrival notice and turnover. */
export function collectedDiagramEstimate(
  route: Route,
  train: Departure,
  snapshot: TrainPositionsSnapshot,
  now: Date,
  disrupted: boolean,
  previous?: PositionEstimate,
) {
  // The direct feed provides the destination needed to verify a GTFS trip.
  if (train.gtfs) return;
  const collected = snapshot.collected;
  if (!collected) return;
  const p: CollectedTrainPosition | undefined = matchedTrainPosition(route, train, collected, now);
  if (!p || disrupted || Date.parse(p.updatedAt) > now.getTime()) return;
  const direct = matchedTrainPosition(route, train, snapshot, now);
  // A server result is authoritative until its lease expires. Do not extrapolate
  // it locally; HTTP fallback removes this field and resumes the shared algorithm.
  const server = snapshot.serverEstimates;
  const estimate = server
    ? server.validUntil > now.getTime()
      ? server.trains.find((e) => e.id === p.id && e.runId === p.model?.runId)
      : undefined
    : estimatePosition(p, direct, now.getTime(), previous);
  if (!estimate) return;
  const position = describeToeiPosition(route, train, { ...p, ...estimate });
  const progress = estimatedStationProgress(route, estimate);
  const model = p.model;
  const advanceAt = progress === 'approaching' ? positionAdvanceAt(p, estimate) : undefined;
  const displayAdvanceMs = p.projection?.advanceMs ?? 0;
  const arrivalAt =
    estimate.visit === model?.visit && model.nextVisit === departureVisit(route)
      ? advanceAt
      : undefined;
  const projectedApproach = progress === 'approaching' && !!model && estimate.visit > model.visit;
  const observedProgress =
    progress === 'departed' && model && model.visit < estimate.visit
      ? estimatedStationProgress(route, { visit: model.visit, toStation: p.toStation })
      : undefined;
  const beforeProjectedDeparture =
    observedProgress && observedProgress !== 'departed'
      ? { progress: observedProgress, position: describeToeiPosition(route, train, p) }
      : undefined;
  return {
    estimate,
    sourceAt: Date.parse(p.updatedAt),
    displayAdvanceMs,
    position: position && { ...position, estimated: true },
    progress,
    projectedApproach,
    projectedApproachAt:
      projectedApproach && advanceAt !== undefined ? advanceAt + displayAdvanceMs : undefined,
    // The estimator may keep its previous position even after confirming a stall.
    stalledApproachProjection: projectedApproach && advanceAt === undefined,
    beforeProjectedDeparture,
    arrivalAt,
    freshUntil: Math.min(
      Date.parse(p.validUntil),
      Date.parse(p.updatedAt) + TRAIN_POSITION_MAX_AGE,
    ),
  };
}

export function statisticalArrivalTime(
  route: Route,
  train: Departure | undefined,
  snapshot: TrainPositionsSnapshot | null | undefined,
  now: Date,
) {
  if (!snapshot?.collected || !train) return;
  const direct = matchedTrainPosition(route, train, snapshot, now);
  if (train.gtfs && !direct) return;
  const position = matchedTrainPosition(route, train, snapshot.collected, now) as
    CollectedTrainPosition | undefined;
  const estimate = position?.vicinityArrival;
  if (
    !estimate ||
    !position ||
    position.toStation !== route.sourceStationId ||
    estimate.station !== route.sourceStationId ||
    estimate.at <= now.getTime() ||
    Date.parse(position.updatedAt) > now.getTime() ||
    stationLocation(route, position)?.progress !== 'approaching'
  )
    return;
  if (
    direct &&
    Date.parse(direct.updatedAt) >= Date.parse(position.updatedAt) &&
    (direct.fromStation !== position.fromStation || direct.toStation !== position.toStation)
  )
    return;
  return estimate.at;
}

const positionIndices = new WeakMap<TrainPositionsSnapshot, Map<string, TrainPosition[]>>();
const ambiguousIds = new WeakMap<Route['schedules']['weekday'], Set<string>>();

export function matchedTrainPosition(
  route: Route,
  train: Departure | undefined,
  snapshot: TrainPositionsSnapshot | null | undefined,
  now: Date,
) {
  if (!train?.trainId || !snapshot || train.serviceDate !== serviceDate(now)) return;
  const schedule = (schedulesForDate(route, train.serviceDate) ?? route.schedules)[train.day];
  let ambiguous = ambiguousIds.get(schedule);
  if (!ambiguous) {
    ambiguous = new Set();
    const seen = new Set<string>();
    for (const entry of schedule) {
      if (!entry.trainId) continue;
      if (seen.has(entry.trainId)) ambiguous.add(entry.trainId);
      seen.add(entry.trainId);
    }
    ambiguousIds.set(schedule, ambiguous);
  }
  if (ambiguous.has(train.trainId)) return;
  let index = positionIndices.get(snapshot);
  if (!index) {
    index = new Map();
    for (const position of snapshot.trains)
      index.set(position.id, [...(index.get(position.id) ?? []), position]);
    positionIndices.set(snapshot, index);
  }
  const matches = (index.get(train.trainId) ?? []).filter(
    (position) =>
      position.id === train.trainId &&
      position.railwayId === route.railwayId &&
      position.direction === route.id.replace(`Toei.${route.railwayId}.`, ''),
  );
  // Duplicate identities cannot establish which observation belongs to this trip.
  if (matches.length !== 1) return;
  const position = matches[0];
  const stamp = Date.parse(position.updatedAt);
  if (
    !trainPositionIsFresh(position, now.getTime()) ||
    serviceDate(new Date(stamp)) !== train.serviceDate
  )
    return;
  if (train.gtfs) {
    const destination = position.destinationStation?.split('.').at(-1);
    if (stamp > now.getTime() || !destination || destination !== train.gtfs.destinationId) return;
    const { stopMask } = train.gtfs;
    const minimum = 32 - Math.clz32(stopMask & -stopMask);
    const maximum = 32 - Math.clz32(stopMask);
    const order = toeiRouteStations(route);
    const withinTrip = (id: string) => {
      const stationId = id.split('.').at(-1)?.toLowerCase();
      return order?.some((s) => s.id === stationId && s.number >= minimum && s.number <= maximum);
    };
    if (
      !withinTrip(position.fromStation) ||
      (position.toStation && !withinTrip(position.toStation))
    )
      return;
  }
  return position;
}

/** Undefined means unavailable; false means the matching train is still elsewhere. */
export function observedTrainApproach(
  route: Route,
  train: Departure | undefined,
  snapshot: TrainPositionsSnapshot | null | undefined,
  now: Date,
): boolean | undefined {
  return observedToeiTrainGuidance(route, train, snapshot, now).approaching;
}

/** Match once so the arrival warning and position diagram use the same observation. */
export function observedToeiTrainGuidance(
  route: Route,
  train: Departure | undefined,
  snapshot: TrainPositionsSnapshot | null | undefined,
  now: Date,
) {
  const position = matchedTrainPosition(route, train, snapshot, now);
  const location = stationLocation(route, position);
  return {
    ...location,
    observation: location ? position : undefined,
    approaching: location ? location.progress === 'approaching' : undefined,
    position: position && train ? describeToeiPosition(route, train, position) : undefined,
  };
}

function describeToeiPosition(
  route: Route,
  train: Departure,
  position: TrainPosition,
): ToeiObservedPosition | undefined {
  const guide = toeiStopGuide(route, train);
  if (!guide || guide.preceding.length < 2) return;
  const origin = route.sourceStationId!;
  const prefix = origin.slice(0, origin.lastIndexOf('.') + 1);
  const id = (value: string | null) =>
    value?.startsWith(prefix) ? value.split('.').at(-1)!.toLowerCase() : undefined;
  const from = id(position.fromStation);
  const to = id(position.toStation);
  if (!from || (position.toStation !== null && !to)) return;
  const previous = guide.preceding.at(-1)!;
  const beforePrevious = guide.preceding.at(-2)!;
  const current = guide.stations[0];
  let stage: ToeiObservedPosition['stage'];
  let description: string;
  if (from === beforePrevious.id && (!to || to === previous.id || to === current.id)) {
    stage = 'before-previous';
    description = to ? '前々駅を出発' : '前々駅';
  } else if (from === previous.id && (!to || to === current.id)) {
    stage = 'previous';
    description = to ? '前駅を出発' : '前駅';
  } else if (from === current.id && !to) {
    stage = 'here';
    description = '当駅';
  } else return;
  return {
    stage,
    description,
    segment: !to
      ? null
      : stage === 'before-previous'
        ? to === current.id
          ? 'both'
          : 'first'
        : 'second',
    updatedAt: position.updatedAt,
  };
}
