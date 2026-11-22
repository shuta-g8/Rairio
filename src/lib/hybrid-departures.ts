import type { Departure, Route } from '../types.ts';
import type { TrainPosition, TrainPositionsSnapshot } from '../../shared/train-positions.ts';
import { trainPositionIsFresh, TRAIN_POSITION_MAX_AGE } from '../../shared/train-positions.ts';
import {
  collectedDiagramEstimate,
  observedToeiTrainGuidance,
  type TrainStationProgress,
} from './toei-position.ts';
import type { PositionEstimate } from '../../shared/position-estimate.ts';
import { departureIdentity, liveDepartureCandidates, serviceDate } from './time.ts';
import type { DepartureBoardDisplay } from './live-departures.ts';

export const SWITCH_OFFSET_MS = 30_000;
export const APPROACH_DURATION_MS = 50_000;
export const AFTER_APPROACH_HOLD_MS = 55_000;
export const APPROACH_END_LEAD_MS = 10_000;
export const HYBRID_LIMITS = {
  maxDelayMs: 10 * 60_000,
  delayConfirmationMs: 20_000,
  delayRetentionMs: 5 * 60_000,
  positionRetentionMs: 3 * 60_000,
  maxTrainHoldMs: 15 * 60_000,
  earlyApproachMs: 30_000,
} as const;
const LOOKBACK_MS = HYBRID_LIMITS.maxTrainHoldMs + SWITCH_OFFSET_MS;

export function hybridTimeline(timestamp: number, delayMs = 0, endLeadMs = APPROACH_END_LEAD_MS) {
  const switchAt = timestamp + delayMs + SWITCH_OFFSET_MS;
  const baselineEnd = switchAt - AFTER_APPROACH_HOLD_MS;
  return {
    approachStart: baselineEnd - APPROACH_DURATION_MS,
    approachEnd: baselineEnd - endLeadMs,
    switchAt,
  };
}

interface TrainState {
  seenAt: number;
  position?: TrainPosition;
  progress?: TrainStationProgress;
  coordinate?: number;
  conflicted?: boolean;
  pendingDelay?: { value: number; firstAt: number };
  delayMs: number;
  delayUntil: number;
  positionUntil: number;
  visited: boolean;
  cleared: boolean;
  approachAt?: number;
  fallbackClosed: boolean;
  approachShown?: boolean;
  approachEndedAt?: number;
  retired: boolean;
  skippedBeforeFirstResponse?: boolean;
  estimate?: PositionEstimate;
  estimateHoldUntil?: number;
  estimatedDelayMs?: number;
}
export interface HybridDepartureSession {
  scope: string;
  day: string;
  lastNow: number;
  snapshotAt: number;
  collectedAt?: number;
  collectedMode?: boolean;
  active?: string;
  lastTurnover?: { train: string; at: number; reason: 'clearance' | 'deadline' | 'estimate' };
  trains: ReadonlyMap<string, TrainState>;
}
export interface HybridDiagnostic {
  sourceAt?: number;
  train: string;
  approachStart: number;
  approachEnd: number;
  switchAt: number;
  delayMs: number;
  delayUntil: number;
  turnoverDelayMs: number;
  phase: 'waiting' | 'approaching' | 'holding';
  cleared: boolean;
}
const scopes = new WeakMap<Route, string>();
function scopeFor(route: Route) {
  let scope = scopes.get(route);
  if (!scope) {
    scope = JSON.stringify([
      route.id,
      route.sourceStationId,
      route.railwayId,
      route.schedules,
      route.timetableEditions,
    ]);
    scopes.set(route, scope);
  }
  return scope;
}
const initialState = (): TrainState => ({
  seenAt: -Infinity,
  delayMs: 0,
  delayUntil: 0,
  positionUntil: 0,
  visited: false,
  cleared: false,
  fallbackClosed: false,
  retired: false,
});

/** A pure route-local state machine. Timetable timestamps are never modified. */
export function resolveHybridDepartures(
  route: Route,
  now: Date,
  positions?: TrainPositionsSnapshot | null,
  previous?: HybridDepartureSession,
  useEstimates = true,
  approachRelease: 'stop-or-turnover' | number = 'stop-or-turnover',
): DepartureBoardDisplay & {
  session: HybridDepartureSession;
  diagnostic?: HybridDiagnostic;
  estimatedDiagram?: DepartureBoardDisplay['position'];
} {
  const holdNotice = approachRelease === 'stop-or-turnover';
  const endLeadMs = holdNotice ? APPROACH_END_LEAD_MS : approachRelease;
  const scope = scopeFor(route);
  // Clock rollback must not resurrect trains or reopen an announcement.
  const timestamp = Math.max(
    now.getTime(),
    previous?.scope === scope ? previous.lastNow : -Infinity,
  );
  const clock = new Date(timestamp);
  const day = serviceDate(clock);
  const prior = previous?.scope === scope && previous.day === day ? previous : undefined;
  const trains = new Map(prior?.trains);
  for (const [key] of trains) {
    const at = Number(key.split('/')[1]);
    if (Number.isFinite(at) && at < timestamp - LOOKBACK_MS) trains.delete(key);
  }
  const selected: Departure[] = [];
  let lastTurnover = prior?.lastTurnover;
  const fetchedAt = positions ? Date.parse(positions.fetchedAt) : -Infinity;
  const acceptedPositions =
    Number.isFinite(fetchedAt) &&
    fetchedAt <= now.getTime() &&
    fetchedAt >= (prior?.snapshotAt ?? -Infinity)
      ? positions
      : undefined;
  const presentations: NonNullable<DepartureBoardDisplay['presentations']> = [];
  let position: DepartureBoardDisplay['position'];
  let estimatedDiagram: DepartureBoardDisplay['position'];
  const collectedMode =
    useEstimates && (positions ? positions.collected !== undefined : !!prior?.collectedMode);
  const collectedAt = Date.parse(positions?.collected?.fetchedAt ?? '');
  const useCollected =
    collectedMode &&
    positions &&
    collectedAt <= now.getTime() &&
    collectedAt >= (prior?.collectedAt ?? -Infinity);
  let diagnostic: HybridDiagnostic | undefined;
  for (const departure of liveDepartureCandidates(route, clock, LOOKBACK_MS)) {
    const key = departureIdentity(departure);
    const state = { ...(trains.get(key) ?? initialState()) };
    const followingFirst = selected.length === 1;
    const reconsiderSkipped = state.skippedBeforeFirstResponse && (useCollected || followingFirst);
    const serverCanCorrect = useCollected && positions.serverEstimates;
    if (state.retired && !reconsiderSkipped && !serverCanCorrect) continue;
    const usesEstimate = collectedMode && !departure.gtfs;
    const forecast =
      usesEstimate && useCollected
        ? collectedDiagramEstimate(
            route,
            departure,
            acceptedPositions === positions ? positions : { ...positions, trains: [] },
            now,
            false,
            state.estimate,
          )
        : undefined;
    // A background tab or HTTP fallback may have retired this row locally.
    // Reconcile it only when the current server frame still places this run
    // at or before the station, within the ordinary hold window.
    if (
      state.retired &&
      !(reconsiderSkipped && (forecast || followingFirst)) &&
      !(
        serverCanCorrect &&
        forecast?.progress &&
        forecast.progress !== 'departed' &&
        timestamp < departure.timestamp + HYBRID_LIMITS.maxTrainHoldMs
      )
    ) {
      state.skippedBeforeFirstResponse = false;
      trains.set(key, state);
      continue;
    }
    state.retired = false;
    state.skippedBeforeFirstResponse = false;
    if (forecast) {
      if (forecast.estimate.runId !== state.estimate?.runId) state.estimatedDelayMs = 0;
      state.estimate = forecast.estimate;
      if (forecast.estimate.delaySeconds > 0)
        state.estimatedDelayMs = forecast.estimate.delaySeconds * 1000;
      state.estimateHoldUntil =
        forecast.progress && forecast.progress !== 'departed' ? forecast.freshUntil : 0;
    }
    const raw = observedToeiTrainGuidance(route, departure, acceptedPositions, now);
    const observation = raw.observation;
    if (
      observation &&
      Date.parse(observation.updatedAt) <= now.getTime() &&
      raw.coordinate !== undefined &&
      raw.progress
    ) {
      const stamp = Date.parse(observation.updatedAt);
      const sameStampConflict =
        stamp === state.seenAt &&
        state.position &&
        (observation.fromStation !== state.position.fromStation ||
          observation.toStation !== state.position.toStation ||
          observation.delay !== state.position.delay);
      if (sameStampConflict) {
        state.conflicted = true;
        state.pendingDelay = undefined;
      }
      if (stamp > state.seenAt) {
        const regressed = state.coordinate !== undefined && raw.coordinate < state.coordinate;
        state.seenAt = stamp;
        if (regressed) {
          state.conflicted = true;
          state.pendingDelay = undefined;
        } else {
          state.conflicted = false;
          // A downstream segment after a local observation establishes clearance
          // more conservatively than departure into the first outgoing segment.
          if (state.visited && raw.coordinate >= 1.5 && observation.toStation !== null)
            state.cleared = true;
          if (raw.progress === 'approaching' || raw.progress === 'here') state.visited = true;
          state.coordinate = raw.coordinate;
          state.progress = raw.progress;
          state.position = observation;
          const local =
            (raw.progress === 'approaching' && raw.coordinate === -0.5) || raw.progress === 'here';
          const delay = observation.delay === undefined ? undefined : observation.delay * 1000;
          if (
            local &&
            delay !== undefined &&
            Number.isSafeInteger(delay) &&
            delay > 0 &&
            delay <= HYBRID_LIMITS.maxDelayMs
          ) {
            const pending = state.pendingDelay;
            if (
              pending?.value === delay &&
              stamp - pending.firstAt >= HYBRID_LIMITS.delayConfirmationMs &&
              stamp - pending.firstAt <= TRAIN_POSITION_MAX_AGE
            ) {
              state.delayMs = Math.max(state.delayMs, delay);
              state.pendingDelay = { value: delay, firstAt: stamp };
              state.delayUntil = Math.min(
                departure.timestamp + HYBRID_LIMITS.maxTrainHoldMs,
                Math.max(
                  stamp + HYBRID_LIMITS.delayRetentionMs,
                  hybridTimeline(departure.timestamp, state.delayMs).switchAt,
                ),
              );
            } else if (pending?.value !== delay || stamp - pending.firstAt > TRAIN_POSITION_MAX_AGE)
              state.pendingDelay = { value: delay, firstAt: stamp };
          } else state.pendingDelay = undefined;
          // Do not shorten the displayed train's lease after one lost response.
          if (raw.progress !== 'departed')
            state.positionUntil = Math.min(
              departure.timestamp + HYBRID_LIMITS.maxTrainHoldMs,
              Math.max(state.positionUntil, stamp + HYBRID_LIMITS.positionRetentionMs),
            );
          else state.positionUntil = 0;
        }
      }
    }
    const fresh =
      !state.conflicted && state.position && trainPositionIsFresh(state.position, timestamp)
        ? state.position
        : undefined;
    const delayMs = timestamp < state.delayUntil ? state.delayMs : 0;
    const timeline = hybridTimeline(departure.timestamp, delayMs, endLeadMs);
    const turnoverDelayMs = usesEstimate ? Math.max(delayMs, state.estimatedDelayMs ?? 0) : delayMs;
    const correctedDeparture = departure.timestamp + turnoverDelayMs;
    const switchAt = Math.min(
      departure.timestamp + HYBRID_LIMITS.maxTrainHoldMs,
      Math.max(
        correctedDeparture + SWITCH_OFFSET_MS,
        usesEstimate ? (state.estimateHoldUntil ?? 0) : state.positionUntil,
      ),
    );
    // Clearance is deliberately not inferred from a null toStation, loss,
    // a stale observation or just the scheduled time passing.
    // Projection may lead the source clock. The published departure is a lower
    // bound for turnover; adding the estimated delay here would count it twice.
    const cleared = usesEstimate
      ? timestamp >= departure.timestamp && forecast?.progress === 'departed'
      : timestamp >= correctedDeparture && state.cleared && fresh;
    // While the first train is held, the timetable alone cannot retire its successor.
    if (cleared || (!followingFirst && timestamp >= switchAt)) {
      if (prior?.active === key)
        lastTurnover = {
          train: key,
          at: timestamp,
          reason: cleared ? (usesEstimate ? 'estimate' : 'clearance') : 'deadline',
        };
      state.retired = true;
      if (state.approachShown) state.approachEndedAt ??= timestamp;
      state.skippedBeforeFirstResponse =
        useEstimates &&
        (!positions || positions.collected === null) &&
        !Number.isFinite(prior?.collectedAt) &&
        prior?.active !== key;
      trains.set(key, state);
      continue;
    }
    // Keep the timetable fallback on its original clock if the estimate expires.
    // After an estimated arrival, loss of the feed must not restart this train's notice.
    if (forecast?.progress === 'here') state.fallbackClosed = true;
    if (!departure.gtfs && !state.fallbackClosed && state.approachAt === undefined) {
      const early =
        fresh &&
        state.progress === 'approaching' &&
        state.coordinate === -0.5 &&
        timestamp >= timeline.approachStart - HYBRID_LIMITS.earlyApproachMs;
      if (timestamp >= timeline.approachEnd) state.fallbackClosed = true;
      else if (early || timestamp >= timeline.approachStart)
        state.approachAt = Math.min(timestamp, timeline.approachStart);
    }
    const fallbackEnd =
      state.approachAt === undefined
        ? timeline.approachEnd
        : state.approachAt + APPROACH_DURATION_MS - endLeadMs;
    if (state.approachAt !== undefined && timestamp >= fallbackEnd) state.fallbackClosed = true;

    const forecastEnd =
      forecast?.arrivalAt === undefined ? undefined : forecast.arrivalAt - endLeadMs;
    if (holdNotice && fresh && state.progress === 'here') state.approachEndedAt ??= timestamp;
    const keepApproaching = holdNotice && state.approachShown;
    if (
      !keepApproaching &&
      endLeadMs > 0 &&
      forecastEnd !== undefined &&
      timestamp >= forecastEnd
    ) {
      state.approachEndedAt ??= forecastEnd;
      state.fallbackClosed = true;
    }
    const approaching =
      state.approachEndedAt === undefined &&
      (keepApproaching ||
        (departure.gtfs
          ? !!fresh && raw.progress === 'approaching' && state.progress === 'approaching'
          : forecast?.progress
            ? forecast.progress === 'approaching'
            : state.approachAt !== undefined && !state.fallbackClosed));
    // A source update may trigger the first notice. A shown notice follows the
    // displayed train until an observation puts it at the station or the row switches.
    if (approaching) state.approachShown = true;
    else if (state.approachShown) state.approachEndedAt ??= timestamp;
    trains.set(key, state);
    if (selected.length === 0) {
      estimatedDiagram = forecast?.position;
      position =
        fresh && (!departure.gtfs || raw.observation)
          ? observedToeiTrainGuidance(
              route,
              departure,
              { fetchedAt: new Date(timestamp).toISOString(), trains: [fresh] },
              now,
            ).position
          : undefined;
      diagnostic = {
        sourceAt: state.position ? Date.parse(state.position.updatedAt) : undefined,
        train: key,
        ...timeline,
        switchAt,
        approachStart: state.approachAt ?? timeline.approachStart,
        approachEnd:
          state.approachEndedAt ??
          (holdNotice && approaching ? switchAt : (forecastEnd ?? fallbackEnd)),
        delayMs,
        turnoverDelayMs,
        delayUntil: state.delayUntil,
        phase: approaching
          ? 'approaching'
          : state.approachEndedAt === undefined &&
              (forecast?.progress === 'before' || !state.fallbackClosed)
            ? 'waiting'
            : 'holding',
        cleared: !!cleared,
      };
    }
    selected.push(departure);
    presentations.push({
      kind: approaching
        ? 'approaching'
        : departure.gtfs && departure.timestamp <= timestamp
          ? 'expired'
          : 'countdown',
    });
    if (selected.length === 2) break;
  }
  const first = selected[0];
  const board: DepartureBoardDisplay['board'] = !first
    ? { kind: 'empty' }
    : first.serviceDate > day
      ? { kind: 'ended', nextDeparture: first }
      : { kind: 'active', departures: selected };
  return {
    board,
    presentations,
    presentation: presentations[0],
    position,
    estimatedDiagram,
    livePhase: diagnostic?.phase === 'approaching' ? 'approaching' : 'holding',
    diagnostic,
    session: {
      scope,
      day,
      lastNow: timestamp,
      snapshotAt: Math.max(
        prior?.snapshotAt ?? -Infinity,
        acceptedPositions ? fetchedAt : -Infinity,
      ),
      trains,
      collectedMode,
      collectedAt: useCollected ? collectedAt : prior?.collectedAt,
      lastTurnover,
      active: board.kind === 'active' ? departureIdentity(board.departures[0]) : undefined,
    },
  };
}
