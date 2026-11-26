import type { DepartureBoardDisplay } from '../src/lib/live-departures.ts';
import type { Route } from '../src/types.ts';
import {
  canonicalTimetable,
  editionServiceDate,
  managesTimetable,
  schedulesForDate,
  timetableEditionForDate,
  timetableHash,
} from './timetable-editions.ts';

export const DEPARTURE_BOARD_LEASE_MS = 40_000;
export const DEPARTURE_BOARD_MAX_BYTES = 262_144;
const CLOCK_LEASE_MS = 5 * 60_000;
const MAX_ROUTES = 16;
const MAX_FRAMES = 41;

export type StationDepartureBoardDisplay = DepartureBoardDisplay & {
  estimatedDiagram?: DepartureBoardDisplay['position'];
};

export interface DepartureBoardPlanFrame {
  at: number;
  display: StationDepartureBoardDisplay;
}

export interface DepartureBoardPlan {
  revision: string;
  validUntil: number;
  frames: DepartureBoardPlanFrame[];
}

export interface StationBoardPlan {
  version: 1;
  stationId: string;
  serverNow: number;
  routes: Record<string, DepartureBoardPlan>;
}

export interface CurrentDepartureBoard {
  revision: string;
  display: StationDepartureBoardDisplay;
}

const revisions = new WeakMap<Route, { day: string; value: Promise<string | undefined> }>();

/** Compare the active verified timetable, even if one reader retains older editions. */
export function departureBoardRevision(route: Route, at: number): Promise<string | undefined> {
  const day = editionServiceDate(at);
  const previous = revisions.get(route);
  if (previous?.day === day) return previous.value;
  const edition = timetableEditionForDate(route, day);
  const schedules = schedulesForDate(route, day);
  const value =
    route.timetableUnavailable || !schedules || (managesTimetable(route) && !edition)
      ? Promise.resolve(undefined)
      : timetableHash(
          canonicalTimetable({
            route: route.id,
            sourceStation: route.sourceStationId,
            railway: route.railwayId,
            day,
            schedules,
            edition: edition && { id: edition.id, sha256: edition.sha256, gtfs: edition.gtfs },
          }),
        );
  revisions.set(route, { day, value });
  return value;
}

function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function epoch(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0 && value <= 8.64e15;
}

function displayText(value: unknown): value is string {
  return typeof value === 'string' && value.length <= 500;
}

function isDeparture(value: unknown) {
  return (
    record(value) &&
    epoch(value.timestamp) &&
    typeof value.serviceDate === 'string' &&
    /^\d{4}-\d{2}-\d{2}$/.test(value.serviceDate) &&
    (value.day === 'weekday' || value.day === 'saturday' || value.day === 'holiday') &&
    displayText(value.time) &&
    displayText(value.type) &&
    displayText(value.destination) &&
    (value.trainId === undefined || displayText(value.trainId)) &&
    (value.platform === undefined || displayText(value.platform)) &&
    (value.extra === undefined || typeof value.extra === 'boolean') &&
    (value.dayOffset === undefined || Number.isSafeInteger(value.dayOffset)) &&
    (value.carCount === undefined || Number.isSafeInteger(value.carCount)) &&
    (value.gtfs === undefined ||
      (record(value.gtfs) &&
        typeof value.gtfs.stopMask === 'number' &&
        Number.isSafeInteger(value.gtfs.stopMask) &&
        value.gtfs.stopMask > 0 &&
        (value.gtfs.destinationId === undefined || displayText(value.gtfs.destinationId))))
  );
}

function isPresentation(value: unknown) {
  if (!record(value)) return false;
  switch (value.kind) {
    case 'countdown':
    case 'approaching':
    case 'stopped':
    case 'departing':
    case 'expired':
      return true;
    case 'progress':
      return (
        typeof value.elapsedMs === 'number' &&
        Number.isFinite(value.elapsedMs) &&
        typeof value.progress === 'number' &&
        Number.isFinite(value.progress)
      );
    default:
      return false;
  }
}

function isPosition(value: unknown) {
  return (
    record(value) &&
    (value.stage === 'before-previous' || value.stage === 'previous' || value.stage === 'here') &&
    (value.segment === null ||
      value.segment === 'first' ||
      value.segment === 'second' ||
      value.segment === 'both') &&
    displayText(value.description) &&
    typeof value.updatedAt === 'string' &&
    Number.isFinite(Date.parse(value.updatedAt)) &&
    (value.estimated === undefined || typeof value.estimated === 'boolean')
  );
}

function isDisplay(value: unknown) {
  if (!record(value) || !record(value.board)) return false;
  const {
    board,
    presentation,
    presentations,
    position,
    estimatedDiagram,
    livePhase,
    arrivalEstimate,
  } = value;
  return (
    (board.kind === 'empty' ||
      (board.kind === 'ended' && isDeparture(board.nextDeparture)) ||
      (board.kind === 'active' &&
        Array.isArray(board.departures) &&
        board.departures.length > 0 &&
        board.departures.length <= 2 &&
        board.departures.every(isDeparture))) &&
    (presentation === undefined || isPresentation(presentation)) &&
    (presentations === undefined ||
      (Array.isArray(presentations) &&
        presentations.length <= 2 &&
        presentations.every(isPresentation))) &&
    (position === undefined || isPosition(position)) &&
    (estimatedDiagram === undefined || isPosition(estimatedDiagram)) &&
    (livePhase === undefined || livePhase === 'approaching' || livePhase === 'holding') &&
    (arrivalEstimate === undefined || displayText(arrivalEstimate))
  );
}

function isRoutePlan(value: unknown, serverNow: number) {
  if (!record(value)) return false;
  const { revision, validUntil, frames } = value;
  if (
    typeof revision !== 'string' ||
    !/^[0-9a-f]{64}$/.test(revision) ||
    !epoch(validUntil) ||
    validUntil <= serverNow ||
    validUntil - serverNow > DEPARTURE_BOARD_LEASE_MS ||
    !Array.isArray(frames) ||
    frames.length === 0 ||
    frames.length > MAX_FRAMES
  )
    return false;
  let lastAt = serverNow - 1;
  return frames.every((frame, index) => {
    if (
      !record(frame) ||
      !epoch(frame.at) ||
      (index === 0 && frame.at !== serverNow) ||
      frame.at <= lastAt ||
      frame.at >= validUntil ||
      !isDisplay(frame.display)
    )
      return false;
    lastAt = frame.at;
    return true;
  });
}

export function isStationBoardPlan(value: unknown, stationId: string): value is StationBoardPlan {
  if (
    !record(value) ||
    value.version !== 1 ||
    value.stationId !== stationId ||
    !epoch(value.serverNow) ||
    !record(value.routes)
  )
    return false;
  const serverNow = value.serverNow;
  const routes = Object.entries(value.routes);
  return (
    routes.length <= MAX_ROUTES &&
    routes.every(
      ([route, plan]) => /^Toei\.[\w.:-]{1,120}$/.test(route) && isRoutePlan(plan, serverNow),
    )
  );
}

export interface StationBoardSample {
  plan: StationBoardPlan;
  receivedAt: number;
  serverAtReceipt: number;
  expiryAtReceipt: number;
}

function elapsed(sample: StationBoardSample, monotonicNow: number) {
  return Math.max(0, monotonicNow - sample.receivedAt);
}

/** Anchor display time to receipt so transport latency cannot advance a frame. */
export function acceptStationBoardPlan(
  value: unknown,
  stationId: string,
  sentAt: number,
  receivedAt: number,
  previous?: StationBoardSample,
): StationBoardSample | undefined {
  if (
    !isStationBoardPlan(value, stationId) ||
    !Number.isFinite(sentAt) ||
    !Number.isFinite(receivedAt) ||
    receivedAt < sentAt ||
    receivedAt - sentAt >= DEPARTURE_BOARD_LEASE_MS ||
    (previous &&
      (previous.plan.stationId !== stationId ||
        receivedAt < previous.receivedAt ||
        value.serverNow <= previous.plan.serverNow))
  )
    return;
  const serverAtReceipt = Math.max(
    value.serverNow,
    previous && elapsed(previous, receivedAt) < CLOCK_LEASE_MS
      ? previous.serverAtReceipt + elapsed(previous, receivedAt)
      : -Infinity,
  );
  // Conservatively spend the entire request turnaround from the lease.
  const expiryAtReceipt = Math.max(serverAtReceipt, value.serverNow + (receivedAt - sentAt));
  return { plan: value, receivedAt, serverAtReceipt, expiryAtReceipt };
}

export function readStationBoardPlan(sample: StationBoardSample, monotonicNow: number) {
  const delta = elapsed(sample, monotonicNow);
  if (delta >= CLOCK_LEASE_MS) return;
  const serverTime = Math.floor(sample.serverAtReceipt + delta);
  const expiryTime = sample.expiryAtReceipt + delta;
  const entries: [string, CurrentDepartureBoard][] = [];
  let nextChangeAt = sample.receivedAt + CLOCK_LEASE_MS;
  for (const [routeId, route] of Object.entries(sample.plan.routes)) {
    if (route.validUntil <= expiryTime) continue;
    const following = route.frames.findIndex((frame) => frame.at > serverTime);
    const frame = route.frames.at(following < 0 ? -1 : following - 1);
    if (!frame) continue;
    entries.push([routeId, { revision: route.revision, display: frame.display }]);
    nextChangeAt = Math.min(
      nextChangeAt,
      monotonicNow + (route.validUntil - expiryTime),
      following < 0 ? Infinity : monotonicNow + (route.frames[following].at - serverTime),
    );
  }
  return { serverTime, nextChangeAt, routes: Object.fromEntries(entries) };
}
