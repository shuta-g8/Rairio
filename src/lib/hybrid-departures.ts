import type { Departure, Route } from '../types.ts';
import type { TrainPosition, TrainPositionsSnapshot } from '../../shared/train-positions.ts';
import {
  trainPositionIsFresh,
  TRAIN_POSITION_MAX_AGE,
  TRAIN_POSITIONS_INTERVAL,
} from '../../shared/train-positions.ts';
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
  fallbackWindow?: { start: number; end: number };
  fallbackClosed: boolean;
  noticeDeadline?: number;
  projectedApproachSourceAt?: number;
  approachContradictedAt?: number;
  lastDisplayedApproachAt?: number;
  approachHiddenAt?: number;
  approachEndedAt?: number;
  retired: boolean;
  retiredServerSourceAt?: number;
  retiredOnProjectedDeparture?: boolean;
  skippedNextAt?: number;
  waitForObservedDeparture?: boolean;
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
  activeDeparture?: Departure;
  next?: string;
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

function activeObservationCoordinate(
  route: Route,
  positions: TrainPositionsSnapshot | null | undefined,
  now: Date,
  prior: HybridDepartureSession | undefined,
) {
  if (!prior?.active || !prior.activeDeparture) return;
  const state = prior.trains.get(prior.active);
  const raw = observedToeiTrainGuidance(route, prior.activeDeparture, positions, now);
  const sourceAt = Date.parse(raw.observation?.updatedAt ?? '');
  if (
    raw.coordinate !== undefined &&
    sourceAt <= now.getTime() &&
    sourceAt > (state?.seenAt ?? -Infinity) &&
    (state?.coordinate === undefined || raw.coordinate >= state.coordinate)
  )
    return raw.coordinate;
  if (state?.position && !state.conflicted && trainPositionIsFresh(state.position, now.getTime()))
    return state.coordinate;
}

/** A pure route-local state machine. Timetable timestamps are never modified. */
export function resolveHybridDepartures(
  route: Route,
  now: Date,
  positions?: TrainPositionsSnapshot | null,
  previous?: HybridDepartureSession,
  useEstimates = true,
  endLeadMs = APPROACH_END_LEAD_MS,
): DepartureBoardDisplay & {
  session: HybridDepartureSession;
  diagnostic?: HybridDiagnostic;
  estimatedDiagram?: DepartureBoardDisplay['position'];
} {
  const scope = scopeFor(route);
  // Nov 21 LCD comparisons showed an early start on these two approaches.
  // Adjust only timetable starts; a matched incoming train can still start immediately.
  const measuredApproach =
    (route.sourceStationId === 'odpt.Station:Toei.Mita.Mita' &&
      route.id === 'Toei.Mita.Northbound') ||
    (route.sourceStationId === 'odpt.Station:Toei.Shinjuku.Jimbocho' &&
      route.id === 'Toei.Shinjuku.Eastbound');
  const timetableStartOffset = measuredApproach && endLeadMs > 0 ? 5_000 : 0;
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
    const hardStop = departure.timestamp + HYBRID_LIMITS.maxTrainHoldMs;
    const followingFirst = selected.length === 1;
    const reconsiderSkipped = state.skippedBeforeFirstResponse && (useCollected || followingFirst);
    const skippedNextAt = state.skippedNextAt;
    const serverCanCorrect = useCollected && positions.serverEstimates;
    if (
      state.retired &&
      (state.cleared || (!reconsiderSkipped && !serverCanCorrect && skippedNextAt === undefined))
    )
      continue;
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
    const currentObservation = fresh && observation?.updatedAt === fresh.updatedAt;
    const wasApproaching =
      prior?.active === key &&
      state.lastDisplayedApproachAt === prior.lastNow &&
      state.approachHiddenAt === undefined;
    // Compare source observations. A new SSE heartbeat can still carry an older position.
    const newerObservation = fresh && forecast && state.seenAt > forecast.sourceAt;
    const directlyApproaching = fresh && state.progress === 'approaching';
    // A newer observation upstream can withdraw an extrapolated approach. Other
    // projections from upstream cannot start it again without evidence of movement.
    if (
      fresh &&
      state.progress === 'before' &&
      state.projectedApproachSourceAt !== undefined &&
      state.seenAt > state.projectedApproachSourceAt &&
      (newerObservation || !forecast)
    )
      state.approachContradictedAt ??= state.seenAt;
    const blockedProjection =
      endLeadMs > 0 &&
      forecast?.projectedApproach &&
      !directlyApproaching &&
      (state.approachContradictedAt !== undefined || forecast.stalledApproachProjection);
    const directProgress = currentObservation || newerObservation ? state.progress : undefined;
    // A corrected turnover needs observed movement before allowing another projected departure.
    const guidance =
      newerObservation || blockedProjection
        ? undefined
        : state.waitForObservedDeparture &&
            directProgress !== 'departed' &&
            forecast?.beforeProjectedDeparture
          ? { ...forecast, ...forecast.beforeProjectedDeparture }
          : forecast;
    const progress =
      guidance?.progress ?? directProgress ?? (blockedProjection ? 'before' : undefined);
    const retiredSourceAt = state.retiredServerSourceAt ?? -Infinity;
    const newerLocalObservation =
      currentObservation &&
      state.seenAt > retiredSourceAt &&
      (directProgress === 'approaching' || directProgress === 'here');
    let restoreSkippedNext = false;
    if (
      state.retired &&
      skippedNextAt !== undefined &&
      timestamp < hardStop &&
      !followingFirst &&
      !guidance?.progress &&
      newerLocalObservation &&
      state.seenAt > skippedNextAt &&
      (raw.coordinate === -0.5 || raw.coordinate === 0)
    ) {
      const activeCoordinate = activeObservationCoordinate(route, acceptedPositions, now, prior);
      // Keep the displayed first if direct observations place it at least as close to this stop.
      restoreSkippedNext =
        activeCoordinate === undefined || activeCoordinate < raw.coordinate || activeCoordinate > 0;
    }
    if (
      state.retired &&
      !restoreSkippedNext &&
      !(reconsiderSkipped && (guidance || followingFirst)) &&
      !(
        serverCanCorrect &&
        forecast &&
        (forecast.sourceAt > retiredSourceAt || newerLocalObservation) &&
        progress &&
        progress !== 'departed' &&
        timestamp < hardStop
      )
    ) {
      state.skippedBeforeFirstResponse = false;
      trains.set(key, state);
      continue;
    }
    if (restoreSkippedNext || (state.retired && state.retiredOnProjectedDeparture))
      state.waitForObservedDeparture = true;
    state.retired = false;
    state.skippedNextAt = undefined;
    state.skippedBeforeFirstResponse = false;
    if (forecast) {
      if (forecast.estimate.runId !== state.estimate?.runId) state.estimatedDelayMs = 0;
      state.estimate = forecast.estimate;
      if (forecast.estimate.delaySeconds > 0)
        state.estimatedDelayMs = forecast.estimate.delaySeconds * 1000;
    }
    if (guidance?.progress) {
      state.estimateHoldUntil = guidance.progress !== 'departed' ? guidance.freshUntil : 0;
    } else if (usesEstimate && directProgress && fresh) {
      state.estimateHoldUntil =
        directProgress === 'departed'
          ? 0
          : Math.min(Date.parse(fresh.validUntil), state.seenAt + TRAIN_POSITION_MAX_AGE);
    }
    const delayMs = timestamp < state.delayUntil ? state.delayMs : 0;
    const timeline = hybridTimeline(departure.timestamp, delayMs, endLeadMs);
    const turnoverDelayMs = usesEstimate ? Math.max(delayMs, state.estimatedDelayMs ?? 0) : delayMs;
    const correctedDeparture = departure.timestamp + turnoverDelayMs;
    const holdUntil = Math.max(
      correctedDeparture + SWITCH_OFFSET_MS,
      usesEstimate ? (state.estimateHoldUntil ?? 0) : state.positionUntil,
    );
    // Clearance is deliberately not inferred from a null toStation, loss,
    // a stale observation or just the scheduled time passing.
    // Projection may lead the source clock. The published departure is a lower
    // bound for turnover; adding the estimated delay here would count it twice.
    const cleared =
      usesEstimate && guidance?.progress
        ? timestamp >= departure.timestamp && progress === 'departed'
        : timestamp >= correctedDeparture && state.cleared && fresh;
    // Keep the timetable fallback on its original clock if the estimate expires.
    // After an estimated arrival, loss of the feed must not restart this train's notice.
    if (progress === 'here') state.fallbackClosed = true;
    const timetableStart = timeline.approachStart + timetableStartOffset;
    const withinEarlyStart = timestamp >= timeline.approachStart - HYBRID_LIMITS.earlyApproachMs;
    if (!departure.gtfs && !state.fallbackClosed && !state.fallbackWindow) {
      const early =
        fresh && state.progress === 'approaching' && state.coordinate === -0.5 && withinEarlyStart;
      if (timestamp >= timeline.approachEnd) state.fallbackClosed = true;
      else if (early || timestamp >= timetableStart)
        state.fallbackWindow = {
          start: Math.min(timestamp, early ? timeline.approachStart : timetableStart),
          end: Math.min(timestamp, timeline.approachStart) + APPROACH_DURATION_MS - endLeadMs,
        };
    }
    const fallbackEnd = state.fallbackWindow?.end ?? timeline.approachEnd;
    if (state.fallbackWindow && timestamp >= fallbackEnd) state.fallbackClosed = true;

    const forecastEnd =
      guidance?.arrivalAt === undefined ? undefined : guidance.arrivalAt - endLeadMs;
    const inWindow = !!state.fallbackWindow && !state.fallbackClosed;
    let approaching: boolean;
    if (endLeadMs > 0) {
      // The diagram and the notice follow the same directed train visit.
      // Only arrival or departure is final. A timer bounds a gap in evidence.
      if (progress === 'here' || progress === 'departed') state.approachEndedAt ??= timestamp;
      const liveApproach =
        progress === 'approaching' &&
        (!!guidance?.progress ||
          !!departure.gtfs ||
          withinEarlyStart ||
          state.noticeDeadline !== undefined);
      if (liveApproach) {
        state.noticeDeadline =
          forecastEnd ??
          state.noticeDeadline ??
          (inWindow && !guidance?.progress
            ? fallbackEnd
            : timestamp + APPROACH_DURATION_MS - endLeadMs);
      } else if (progress === 'before' && state.noticeDeadline !== undefined) {
        state.noticeDeadline = Math.min(state.noticeDeadline, timestamp);
      } else if (!progress && inWindow) state.noticeDeadline ??= fallbackEnd;
      approaching =
        state.approachEndedAt === undefined &&
        (liveApproach || (progress === undefined && timestamp < (state.noticeDeadline ?? 0)));
    } else {
      // Preserve the timed comparison policy.
      const incoming = departure.gtfs
        ? !!currentObservation && state.progress === 'approaching'
        : guidance?.progress
          ? guidance.progress === 'approaching'
          : inWindow;
      approaching = state.approachEndedAt === undefined && incoming;
      if (approaching) state.noticeDeadline = forecastEnd ?? state.noticeDeadline ?? fallbackEnd;
      else if (state.noticeDeadline !== undefined) state.approachEndedAt ??= timestamp;
    }

    // Show the old train without its notice for one poll interval, even if a poll skips the stop.
    // A resumed tab can move past observations the user has already missed.
    if (cleared || (!followingFirst && timestamp >= Math.min(hardStop, holdUntil)))
      approaching = false;
    if (wasApproaching && !approaching)
      state.approachHiddenAt =
        timestamp - prior.lastNow < TRAIN_POSITIONS_INTERVAL ? timestamp : prior.lastNow;
    const afterApproach = (state.approachHiddenAt ?? -Infinity) + TRAIN_POSITIONS_INTERVAL;
    const switchAt = Math.min(hardStop, Math.max(holdUntil, afterApproach));
    // While the first train is held, the timetable alone cannot retire its successor.
    if ((cleared && timestamp >= afterApproach) || (!followingFirst && timestamp >= switchAt)) {
      if (prior?.active === key)
        lastTurnover = {
          train: key,
          at: timestamp,
          reason: cleared ? (guidance?.progress ? 'estimate' : 'clearance') : 'deadline',
        };
      state.retired = true;
      // The displayed next can expire before the feed has ever observed it near this station.
      if (
        !cleared &&
        prior?.next === key &&
        progress === undefined &&
        !state.visited &&
        state.progress !== 'departed' &&
        state.approachEndedAt === undefined &&
        timestamp < hardStop
      )
        state.skippedNextAt = timestamp;
      state.retiredOnProjectedDeparture = !!(
        cleared &&
        guidance === forecast &&
        forecast?.beforeProjectedDeparture
      );
      state.retiredServerSourceAt = serverCanCorrect
        ? Math.max(state.seenAt, forecast?.sourceAt ?? -Infinity)
        : undefined;
      if (cleared || (endLeadMs === 0 && state.noticeDeadline !== undefined))
        state.approachEndedAt ??= timestamp;
      state.skippedBeforeFirstResponse =
        useEstimates &&
        (!positions || positions.collected === null) &&
        !Number.isFinite(prior?.collectedAt) &&
        prior?.active !== key;
      trains.set(key, state);
      continue;
    }
    trains.set(key, state);
    if (selected.length === 0) {
      if (approaching) {
        if (endLeadMs > 0 && guidance?.projectedApproach && !directlyApproaching)
          state.projectedApproachSourceAt = guidance.sourceAt;
        else if (progress === 'approaching') state.projectedApproachSourceAt = undefined;
        state.lastDisplayedApproachAt = timestamp;
        state.approachHiddenAt = undefined;
      }
      const arrived = endLeadMs > 0 && state.approachEndedAt !== undefined;
      const unconfirmedRegression =
        progress === 'before' &&
        state.approachContradictedAt !== undefined &&
        Math.max(state.seenAt, forecast?.sourceAt ?? -Infinity) <= state.approachContradictedAt;
      position =
        currentObservation &&
        !unconfirmedRegression &&
        (!arrived || state.progress === 'here' || state.progress === 'departed')
          ? raw.position
          : undefined;
      estimatedDiagram = guidance?.progress
        ? unconfirmedRegression || (arrived && progress !== 'here' && progress !== 'departed')
          ? undefined
          : guidance.position
        : usesEstimate
          ? position
          : undefined;
      diagnostic = {
        sourceAt: state.position ? Date.parse(state.position.updatedAt) : undefined,
        train: key,
        ...timeline,
        switchAt,
        approachStart: state.fallbackWindow?.start ?? timetableStart,
        approachEnd: state.approachEndedAt ?? state.noticeDeadline ?? forecastEnd ?? fallbackEnd,
        delayMs,
        turnoverDelayMs,
        delayUntil: state.delayUntil,
        phase: approaching
          ? 'approaching'
          : state.approachEndedAt === undefined &&
              (progress === 'before' ||
                (state.noticeDeadline === undefined && !state.fallbackClosed))
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
  const [first, next] = selected;
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
      activeDeparture: board.kind === 'active' ? first : undefined,
      next: board.kind === 'active' && next ? departureIdentity(next) : undefined,
    },
  };
}
