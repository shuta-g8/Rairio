import type { Departure, Route } from '../types.ts';
import {
  trainPositionIsFresh,
  TRAIN_POSITION_MAX_AGE,
  TRAIN_POSITIONS_INTERVAL,
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
import {
  isTochomaeBranchBoard,
  toeiDepartureVisit,
  toeiPositionStations,
  toeiRouteStations,
  toeiStopGuide,
} from './toei-stops.ts';
import { schedulesForDate } from '../../shared/timetable-editions.ts';

export type TrainStationProgress = 'before' | 'approaching' | 'here' | 'departed';

interface PriorObservation {
  position?: TrainPosition;
  coordinate?: number;
}

const stationVisits = new WeakMap<Route, Map<string, number[]>>();

function continuedJunctionVisit(
  position: TrainPosition,
  prior: PriorObservation | undefined,
  origin: number,
) {
  const previous = prior?.position;
  if (
    !previous ||
    prior.coordinate === undefined ||
    previous.id !== position.id ||
    previous.direction !== position.direction ||
    previous.railwayId !== position.railwayId
  )
    return;
  const stamp = Date.parse(position.updatedAt);
  const earlier = Date.parse(previous.updatedAt);
  if (stamp < earlier || !trainPositionIsFresh(previous, stamp)) return;
  const visit = origin + prior.coordinate;
  if (previous.toStation === null && previous.fromStation === position.fromStation) return visit;
  if (stamp > earlier && previous.toStation === position.fromStation) return Math.ceil(visit);
}

function stationLocation(
  route: Route,
  position: TrainPosition | undefined,
  modelVisit?: number,
  prior?: PriorObservation,
): { progress: TrainStationProgress; coordinate: number } | undefined {
  if (!position || !route.sourceStationId) return;
  const order = toeiPositionStations(route);
  if (!order) return;
  const prefix = route.sourceStationId.slice(0, route.sourceStationId.lastIndexOf('.') + 1);
  // The loop's Tochomae occurs twice. Resolve a segment from both endpoints,
  // never from the first occurrence of the from-station alone.
  let visits = stationVisits.get(route);
  if (!visits) {
    visits = new Map();
    for (const [index, station] of order.entries()) {
      const known = visits.get(station.id);
      if (known) known.push(index);
      else visits.set(station.id, [index]);
    }
    stationVisits.set(route, visits);
  }
  const indices = (id: string) =>
    id.startsWith(prefix) ? (visits.get(id.slice(prefix.length).toLowerCase()) ?? []) : [];
  const origin = toeiDepartureVisit(route);
  if (origin < 0) return;
  // Native branch tracks count from their own origin. OuterLoop tracks count the full loop.
  const nativeBranch = isTochomaeBranchBoard(route) && position.direction === 'Toei.Hikarigaoka';
  const visit = modelVisit === undefined ? undefined : modelVisit + (nativeBranch ? origin : 0);
  const from = indices(position.fromStation);
  if (position.toStation === null) {
    const candidates = nativeBranch ? from.filter((index) => index >= origin) : from;
    const index =
      visit ??
      (candidates.length === 1 ? candidates[0] : continuedJunctionVisit(position, prior, origin));
    if (index === undefined || !candidates.includes(index)) return;
    const coordinate = index - origin;
    return {
      progress: coordinate === 0 ? 'here' : coordinate > 0 ? 'departed' : 'before',
      coordinate,
    };
  }
  const to = indices(position.toStation);
  // A multi-station report with unique endpoints still locates the train on its route.
  // At a repeated endpoint, an adjacent segment identifies which visit the provider meant.
  const repeatedEndpoint = from.length > 1 || to.length > 1;
  const segments = from.flatMap((start) =>
    to
      .filter((end) => end > start && (!repeatedEndpoint || end === start + 1))
      .map((end) => ({ start, end })),
  );
  if (segments.length !== 1) return;
  const segment = segments[0];
  if (
    (visit !== undefined && segment.start + 0.5 !== visit) ||
    (nativeBranch && segment.end < origin)
  )
    return;
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
  if (!p?.model || disrupted) return;
  const timestamp = now.getTime();
  const sourceAt = Date.parse(p.updatedAt);
  if (sourceAt > timestamp) return;
  const { model } = p;
  const direct = matchedTrainPosition(route, train, snapshot, now);
  // A server result is authoritative until its lease expires. Do not extrapolate
  // it locally; HTTP fallback removes this field and resumes the shared algorithm.
  const server = snapshot.serverEstimates;
  const estimate = server
    ? server.validUntil > timestamp
      ? server.trains.find((e) => e.id === p.id && e.runId === model.runId)
      : undefined
    : estimatePosition(p, direct, timestamp, previous);
  if (!estimate) return;
  const projected = { ...p, ...estimate };
  const location = stationLocation(route, projected, estimate.visit);
  const observed = stationLocation(route, p, model.visit);
  if (!observed || !location) return;
  const progress = location.progress;
  const observedProgress = observed.progress;
  const advanceAt = positionAdvanceAt(p, estimate);
  const { projection } = p;
  const displayAdvanceMs = projection?.advanceMs ?? 0;
  const incomingProjection =
    observedProgress === 'approaching' &&
    projection?.fromStation === route.sourceStationId &&
    projection?.toStation === null;
  const priorObservation = estimate.observation;
  const phaseIsCurrent =
    !priorObservation ||
    (priorObservation.at === sourceAt && priorObservation.visit === model.visit);
  const hasArrivalBound =
    priorObservation?.lowerDecileAt !== undefined ||
    (p.vicinityArrival?.station === p.toStation && p.vicinityArrival.lowerDecileAt !== undefined);
  // The bundled duration measures a source phase, using midpoints of polling intervals.
  // When both feeds still show the incoming segment, reserve the last half interval for
  // the diagram's advance. D1's conditional bound, when present, takes precedence.
  const keepIncomingDiagram =
    progress === 'here' &&
    incomingProjection &&
    displayAdvanceMs > 0 &&
    projection.fromStation === p.toStation &&
    model.nextVisit === model.visit + 0.5 &&
    estimate.visit === model.nextVisit &&
    phaseIsCurrent &&
    !hasArrivalBound &&
    direct?.direction === p.direction &&
    direct.fromStation === p.fromStation &&
    direct.toStation === p.toStation &&
    Date.parse(direct.updatedAt) <= timestamp &&
    timestamp < projection.at + model.lead - TRAIN_POSITIONS_INTERVAL / 2;
  // The arrival notice and turnover consume progress and advanceAt on their own clocks.
  const position = keepIncomingDiagram
    ? describeToeiPosition(route, train, p, observed.coordinate)
    : describeToeiPosition(route, train, projected, location.coordinate);
  const approachAdvanceAt = incomingProjection ? advanceAt : undefined;
  // Both position leads are for the diagram. A notice uses the source clock.
  const projectedTransitionAt =
    advanceAt === undefined ? undefined : advanceAt + displayAdvanceMs + model.lead;
  const noticeArrivalAt = approachAdvanceAt === undefined ? undefined : projectedTransitionAt;
  const projectedApproach = progress === 'approaching' && estimate.visit > model.visit;
  const beforeProjectedDeparture =
    progress === 'departed' && observedProgress && observedProgress !== 'departed'
      ? {
          progress: observedProgress,
          position: describeToeiPosition(route, train, p, observed.coordinate),
        }
      : undefined;
  const beforeProjectedArrival =
    (progress === 'here' || progress === 'departed') &&
    (observedProgress === 'before' || observedProgress === 'approaching')
      ? observedProgress
      : undefined;
  return {
    estimate,
    sourceAt,
    sourceDelay: p.delay,
    displayAdvanceMs,
    position: position && { ...position, estimated: true },
    progress,
    observedProgress,
    beforeProjectedArrival,
    projectedApproach,
    projectedApproachAt: projectedApproach ? projectedTransitionAt : undefined,
    // The estimator may keep its previous position even after confirming a stall.
    stalledApproachProjection: projectedApproach && advanceAt === undefined,
    beforeProjectedDeparture,
    arrivalAt:
      progress === 'approaching' && estimate.visit === model.visit ? approachAdvanceAt : undefined,
    noticeArrivalAt,
    freshUntil: Math.min(Date.parse(p.validUntil), sourceAt + TRAIN_POSITION_MAX_AGE),
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
      (position.direction === route.id.replace(`Toei.${route.railwayId}.`, '') ||
        (isTochomaeBranchBoard(route) && position.direction === 'OuterLoop')),
  );
  // Duplicate identities cannot establish which observation belongs to this trip.
  if (matches.length !== 1) return;
  const position = matches[0];
  if (position.ambiguousTochomaeBranch && isTochomaeBranchBoard(route)) return;
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
  prior?: PriorObservation,
) {
  const position = matchedTrainPosition(route, train, snapshot, now);
  const location = stationLocation(
    route,
    position,
    (position as CollectedTrainPosition | undefined)?.model?.visit,
    prior,
  );
  return {
    ...location,
    observation: location ? position : undefined,
    approaching: location ? location.progress === 'approaching' : undefined,
    position:
      location && position && train
        ? describeToeiPosition(route, train, position, location.coordinate)
        : undefined,
  };
}

function describeToeiPosition(
  route: Route,
  train: Departure,
  position: TrainPosition,
  coordinate: number,
): ToeiObservedPosition | undefined {
  if (coordinate < -2 || coordinate > 0) return;
  const guide = toeiStopGuide(route, train);
  if (!guide) return;
  const order = toeiPositionStations(route);
  const start = toeiDepartureVisit(route);
  if (!order || start < 2) return;
  const origin = route.sourceStationId!;
  const prefix = origin.slice(0, origin.lastIndexOf('.') + 1);
  const id = (value: string | null) =>
    value?.startsWith(prefix) ? value.split('.').at(-1)!.toLowerCase() : undefined;
  const from = id(position.fromStation);
  const to = id(position.toStation);
  if (!from || (position.toStation !== null && !to)) return;
  const previous = order[start - 1];
  const beforePrevious = order[start - 2];
  const current = order[start];
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
