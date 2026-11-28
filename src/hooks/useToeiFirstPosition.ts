import { useLayoutEffect, useRef } from 'react';
import {
  trainPositionIsFresh,
  type TrainPosition,
  type TrainPositionsSnapshot,
} from '../../shared/train-positions';
import { departureIdentity, serviceDate } from '../lib/time';
import { observedToeiTrainGuidance, type TrainStationProgress } from '../lib/toei-position';
import type { Departure, Route } from '../types';

interface FirstPosition {
  key: string;
  position: TrainPosition;
  coordinate: number;
  progress: TrainStationProgress;
  seenAt: number;
  conflict?: 'movement' | 'identity';
}

export function useToeiFirstPosition(
  route: Route,
  train: Departure | undefined,
  positions: TrainPositionsSnapshot | null | undefined,
  now: Date,
) {
  const saved = useRef<FirstPosition | undefined>(undefined);
  const key =
    train?.serviceDate === serviceDate(now)
      ? `${route.id}/${route.sourceStationId}/${departureIdentity(train)}`
      : undefined;
  const prior = saved.current?.key === key ? saved.current : undefined;
  const nowMs = now.getTime();
  const fetchedAt = Date.parse(positions?.fetchedAt ?? '');
  const snapshot = fetchedAt <= nowMs ? positions : undefined;
  const { observation, progress, coordinate } = observedToeiTrainGuidance(
    route,
    train,
    snapshot,
    now,
    prior?.conflict ? undefined : prior,
  );
  const stamp = Date.parse(observation?.updatedAt ?? '');
  let current = prior;

  if (
    key &&
    observation &&
    progress &&
    coordinate !== undefined &&
    observation.trainType === train?.type &&
    stamp <= fetchedAt &&
    (!prior || stamp >= prior.seenAt)
  ) {
    const inconsistent =
      prior &&
      (coordinate < prior.coordinate ||
        (stamp === prior.seenAt &&
          (progress !== prior.progress || coordinate !== prior.coordinate)));
    if (inconsistent) {
      // A backward or conflicting report cannot renew the lease or restart the warning.
      current = { ...prior, seenAt: stamp, conflict: prior.conflict ?? 'movement' };
    } else if (!prior || stamp > prior.seenAt) {
      current = { key, position: observation, progress, coordinate, seenAt: stamp };
    }
  } else if (prior && snapshot) {
    let reportedAt = -Infinity;
    for (const entry of snapshot.trains) {
      if (entry.id !== train?.trainId) continue;
      const updatedAt = Date.parse(entry.updatedAt);
      if (updatedAt <= fetchedAt) reportedAt = Math.max(reportedAt, updatedAt);
    }
    // An unmatched report about this ID is different from an omitted row.
    if (reportedAt >= prior.seenAt)
      current = { ...prior, seenAt: reportedAt, conflict: 'identity' };
  }

  useLayoutEffect(() => {
    saved.current = current;
  }, [current]);

  if (
    !current ||
    current.conflict === 'identity' ||
    Date.parse(current.position.updatedAt) > nowMs ||
    !trainPositionIsFresh(current.position, nowMs)
  )
    return { occupyingFirst: false, approaching: false };
  return {
    occupyingFirst: current.progress === 'approaching' || current.progress === 'here',
    approaching: current.progress === 'approaching' && !current.conflict,
  };
}
