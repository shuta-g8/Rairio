import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { timetableEditionForDate } from '../../shared/timetable-editions';
import {
  TRAIN_POSITION_MAX_AGE,
  TRAIN_POSITIONS_INTERVAL,
  trainPositionIsFresh,
  type TrainPositionsSnapshot,
} from '../../shared/train-positions';
import { fetchStation } from '../lib/data';
import { serviceDate } from '../lib/time';
import {
  resolveToeiSpecialCalls,
  toeiSpecialCallStationIds,
  type ToeiSpecialCall,
} from '../lib/toei-special-calls';
import type { Route, StationData } from '../types';

const empty = new Map<string, StationData>();
const POSITION_POLL_GRACE_MS = 2_000;

interface InboundTerminal {
  call: ToeiSpecialCall;
  validUntil: number;
  omittedAt?: number;
}

function retainInboundTerminals(
  route: Route,
  snapshot: TrainPositionsSnapshot,
  now: number,
  calls: ToeiSpecialCall[],
  previous: readonly InboundTerminal[],
) {
  const inbound: InboundTerminal[] = [];
  for (const call of calls) {
    if (call.kind !== 'terminates') continue;
    const position = snapshot.trains.find((position) => position.id === call.trainId)!;
    if (position.fromStation === route.sourceStationId) continue;
    inbound.push({
      call,
      validUntil: Math.min(
        Date.parse(position.validUntil),
        Date.parse(position.updatedAt) + TRAIN_POSITION_MAX_AGE,
      ),
    });
  }

  if (!previous.length) return inbound;
  const fetchedAt = Date.parse(snapshot.fetchedAt);
  const direction = route.id.slice(`Toei.${route.railwayId}.`.length);
  const hasFreshPositions = snapshot.trains.some(
    (position) =>
      position.railwayId === route.railwayId &&
      position.direction === direction &&
      Date.parse(position.updatedAt) <= fetchedAt &&
      trainPositionIsFresh(position, now),
  );
  if (!hasFreshPositions) return inbound;

  for (const terminal of previous) {
    const { call, validUntil, omittedAt } = terminal;
    if (
      (omittedAt === undefined ? fetchedAt >= call.expiresAt : fetchedAt !== omittedAt) ||
      snapshot.trains.some((position) => position.id === call.trainId)
    )
      continue;
    // A single healthy poll can omit an inbound train. Keep its verified order
    // through the next poll, within the source's existing position validity.
    const expiresAt = Math.min(
      validUntil,
      fetchedAt + TRAIN_POSITIONS_INTERVAL + POSITION_POLL_GRACE_MS,
    );
    if (now >= expiresAt) continue;
    inbound.push({ ...terminal, omittedAt: fetchedAt });
    calls.push({ ...call, expiresAt });
  }
  return inbound;
}

export function useToeiSpecialCalls(
  route: Route,
  positions: TrainPositionsSnapshot | null | undefined,
  now: Date,
) {
  const date = serviceDate(now);
  const scope = JSON.stringify([
    route.id,
    route.sourceStationId,
    date,
    timetableEditionForDate(route, date)?.id ?? route.sourceUpdated,
  ]);
  const eligible = useRef<{ scope: string; snapshot: TrainPositionsSnapshot } | undefined>(
    undefined,
  );
  const prior = eligible.current?.scope === scope ? eligible.current.snapshot : undefined;
  const receivedAt = Date.parse(positions?.fetchedAt ?? '');
  const priorAt = Date.parse(prior?.fetchedAt ?? '');
  const nowMs = now.getTime();
  // The feed can arrive ahead of the board's next clock tick. In that interval
  // keep evaluating the previous observation against its original expiry.
  const snapshot =
    !positions || !Number.isFinite(receivedAt)
      ? undefined
      : receivedAt <= nowMs && (!prior || receivedAt >= priorAt)
        ? positions
        : priorAt <= nowMs
          ? prior
          : undefined;
  useLayoutEffect(() => {
    eligible.current = snapshot ? { scope, snapshot } : undefined;
  }, [scope, snapshot]);

  const [loaded, setLoaded] = useState<{ scope: string; stations: Map<string, StationData> }>();
  const stations = loaded?.scope === scope ? loaded.stations : empty;
  const missing = toeiSpecialCallStationIds(route, snapshot, now)
    .filter((id) => !stations.has(id))
    .sort()
    .join(',');
  const fetchedAt = snapshot?.fetchedAt;

  useEffect(() => {
    if (!missing) return;
    const controller = new AbortController();
    void Promise.allSettled(
      missing.split(',').map((id) => fetchStation(id, controller.signal, date)),
    ).then((results) => {
      if (controller.signal.aborted) return;
      const found = results.flatMap((result) =>
        result.status === 'fulfilled' ? [result.value] : [],
      );
      if (!found.length) return;
      setLoaded((previous) => {
        const stations = new Map(previous?.scope === scope ? previous.stations : undefined);
        for (const station of found) stations.set(station.id, station);
        return { scope, stations };
      });
    });
    return () => controller.abort();
  }, [date, fetchedAt, missing, scope]);

  const terminals = useRef<{ scope: string; inbound: readonly InboundTerminal[] }>(undefined);
  const calls = resolveToeiSpecialCalls(route, snapshot, now, stations);
  const previous = terminals.current?.scope === scope ? terminals.current.inbound : [];
  const inbound = snapshot && retainInboundTerminals(route, snapshot, nowMs, calls, previous);
  useLayoutEffect(() => {
    terminals.current = inbound?.length ? { scope, inbound } : undefined;
  }, [inbound, scope]);
  return calls.sort((a, b) => a.at - b.at || a.trainId.localeCompare(b.trainId));
}
