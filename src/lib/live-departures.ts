import type { Departure, Route } from '../types.ts';
import {
  trainPositionIsFresh,
  type TrainPosition,
  type TrainPositionsSnapshot,
} from '../../shared/train-positions.ts';
import {
  observedToeiTrainGuidance,
  type ToeiObservedPosition,
  type TrainStationProgress,
} from './toei-position.ts';
import {
  DEPARTURE_HOLD_MS,
  departureIdentity,
  departurePresentation,
  liveDepartureCandidates,
  serviceDate,
  type DepartureBoardState,
  type DeparturePresentation,
} from './time.ts';

export const LIVE_LOOKBACK_MS = 10 * 60_000;
// Candidate retention is independent of the 90-second observation lifetime.
// Missing data never confirms departure, but cannot pin a vanished train forever.
export const LIVE_POSITION_RETENTION_MS = 3 * 60_000;

interface Observation {
  departure: Departure;
  position: TrainPosition;
  progress: TrainStationProgress;
  coordinate: number;
  seenAt: number;
  conflicted?: boolean;
}

export interface LiveDepartureSession {
  route: Route;
  day: string;
  changedAt: number;
  observations: ReadonlyMap<string, Observation>;
  order: string[];
  active?: Departure;
}

export interface DepartureBoardDisplay {
  arrivalEstimate?: string;
  board: DepartureBoardState;
  presentation?: DeparturePresentation;
  presentations?: DeparturePresentation[];
  position?: ToeiObservedPosition;
  livePhase?: 'approaching' | 'holding';
}

type Guidance = ReturnType<typeof observedToeiTrainGuidance>;
interface Candidate {
  departure: Departure;
  observation?: Observation;
  guidance?: Guidance;
}

function sameLocation(a: TrainPosition, b: TrainPosition) {
  return a.fromStation === b.fromStation && a.toStation === b.toStation;
}

function presentationFor(candidate: Candidate, now: Date): DeparturePresentation {
  if (candidate.guidance?.progress === 'approaching') return { kind: 'approaching' };
  // A known train must not acquire a timetable-based departure/arrival warning
  // when its observation expires. Leave the existing status cell empty instead.
  if (candidate.observation || candidate.departure.gtfs)
    return { kind: candidate.departure.timestamp > now.getTime() ? 'countdown' : 'expired' };
  return departurePresentation(candidate.departure.timestamp, now);
}

/** Route-local observation fences, delayed candidates, and presentation decisions.
 * Repeated renders do not change the session or extend a source observation. */
export function resolveLiveDepartures(
  route: Route,
  now: Date,
  positions: TrainPositionsSnapshot | null | undefined,
  previous?: LiveDepartureSession,
): DepartureBoardDisplay & { session: LiveDepartureSession } {
  const timestamp = now.getTime();
  const day = serviceDate(now);
  let session: LiveDepartureSession =
    previous?.route === route && previous.day === day && timestamp >= previous.changedAt
      ? previous
      : { route, day, changedAt: timestamp, observations: new Map(), order: [] };
  let observations = session.observations;
  const save = (key: string, value?: Observation) => {
    const next = new Map(observations);
    if (value) next.set(key, value);
    else next.delete(key);
    observations = next;
  };
  // Keep intermediate services and their departure observations in the same window.
  const lookback = Math.max(LIVE_LOOKBACK_MS, timestamp - (session.active?.timestamp ?? timestamp));
  for (const [key, observation] of observations)
    if (observation.departure.timestamp < timestamp - lookback) save(key);

  const candidates: Candidate[] = [];
  let upcoming = 0;
  for (const departure of liveDepartureCandidates(route, now, lookback)) {
    const key = departureIdentity(departure);
    let observation = observations.get(key);
    const raw = observedToeiTrainGuidance(route, departure, positions, now);
    let guidance: Guidance | undefined;
    if (
      raw.observation &&
      raw.progress !== undefined &&
      raw.coordinate !== undefined &&
      !(raw.progress === 'departed' && timestamp < departure.timestamp)
    ) {
      const stamp = Date.parse(raw.observation.updatedAt);
      if (!observation || stamp > observation.seenAt) {
        if (
          observation &&
          (observation.progress === 'departed' || raw.coordinate < observation.coordinate)
        ) {
          // Remember even a rejected timestamp, without renewing candidate retention.
          observation = { ...observation, seenAt: stamp, conflicted: true };
        } else {
          observation = {
            departure,
            position: raw.observation,
            progress: raw.progress,
            coordinate: raw.coordinate,
            seenAt: stamp,
          };
          guidance = raw;
        }
        save(key, observation);
      } else if (stamp === observation.seenAt) {
        if (!sameLocation(observation.position, raw.observation) && !observation.conflicted) {
          observation = { ...observation, conflicted: true };
          save(key, observation);
        }
        if (
          !observation.conflicted &&
          sameLocation(observation.position, raw.observation) &&
          trainPositionIsFresh(observation.position, timestamp)
        )
          guidance = raw;
      }
    }
    if (observation?.progress === 'departed') continue;
    const visible = departure.timestamp + DEPARTURE_HOLD_MS > timestamp;
    const retained =
      observation &&
      timestamp < Date.parse(observation.position.updatedAt) + LIVE_POSITION_RETENTION_MS;
    if (visible || guidance || retained || candidates.length === 1) {
      candidates.push({ departure, observation, guidance });
      if (visible && ++upcoming >= 2) break;
    }
  }

  // Times remain scheduled times, so row order must use that same basis.
  // Position snapshots can confirm departure, but must not put a later time
  // above an earlier one or preserve such an inversion after a lost response.
  const selected = candidates.slice(0, 2);
  const order = selected.map((candidate) => departureIdentity(candidate.departure));
  const first = selected[0];
  const active = first?.observation ? first.departure : undefined;
  if (
    observations !== session.observations ||
    order.join('|') !== session.order.join('|') ||
    (active && departureIdentity(active)) !== (session.active && departureIdentity(session.active))
  )
    session = { route, day, changedAt: timestamp, observations, active, order };

  const board: DepartureBoardState = !first
    ? { kind: 'empty' }
    : first.departure.serviceDate > day
      ? { kind: 'ended', nextDeparture: first.departure }
      : { kind: 'active', departures: selected.map((candidate) => candidate.departure) };
  const presentations = selected.map((candidate) => presentationFor(candidate, now));
  return {
    session,
    board,
    presentations,
    presentation: presentations[0],
    livePhase: first?.observation
      ? first.guidance?.progress === 'approaching'
        ? 'approaching'
        : 'holding'
      : undefined,
    // Candidate retention must not suppress the existing position panel. Only
    // accepted, fresh observations reach guidance; the board prioritizes arrival warnings.
    position: first?.guidance?.position,
  };
}
