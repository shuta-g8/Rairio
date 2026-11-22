import { ODPT_API, TOEI_OPERATOR } from './transit-source.ts';

export const TRAIN_POSITIONS_SOURCE = `${ODPT_API}odpt:Train?odpt:operator=${TOEI_OPERATOR}`;
export const TRAIN_POSITIONS_CATALOG = 'https://ckan.odpt.org/dataset/r_train_location-toei';
export const TRAIN_POSITIONS_INTERVAL = 30000;
export const TRAIN_POSITION_MAX_AGE = 90000;
export interface TrainPosition {
  id: string;
  railwayId: string;
  direction: string;
  fromStation: string;
  toStation: string | null;
  updatedAt: string;
  validUntil: string;
  delay?: number;
  trainType?: string;
  destinationStation?: string;
}
export interface CollectedTrainPosition extends TrainPosition {
  vicinityArrival?: { station: string; at: number };
  projection?: { at: number; fromStation: string; toStation: string | null };
  model?: {
    runId: string;
    visit: number;
    nextVisit: number;
    lead: number;
    dwellUntil: number;
    usualExit?: number;
    entryLag?: number;
  };
}
export interface CollectedPositions {
  fetchedAt: string;
  trains: CollectedTrainPosition[];
}
export interface TrainPositionsSnapshot {
  serverEstimates?: {
    validUntil: number;
    trains: (import('./position-estimate.ts').PositionEstimate & { id: string })[];
  };
  fetchedAt: string;
  trains: TrainPosition[];
  // Remaining server cache lifetime at response creation, not observation validity.
  refreshAfterMs?: number;
  // Absent selects the original diagram. Null means collection is temporarily unavailable.
  collected?: CollectedPositions | null;
}

/** Use the same freshness window at the API boundary and on every board clock tick. */
export function trainPositionIsFresh(
  position: Pick<TrainPosition, 'updatedAt' | 'validUntil'>,
  now: number,
) {
  const updated = Date.parse(position.updatedAt);
  const valid = Date.parse(position.validUntil);
  return (
    Number.isFinite(updated) &&
    Number.isFinite(valid) &&
    updated <= now + 60000 &&
    now - updated < TRAIN_POSITION_MAX_AGE &&
    valid > now
  );
}

function validPositionRows(value: unknown): value is TrainPositionsSnapshot {
  if (!value || typeof value !== 'object') return false;
  const snapshot = value as TrainPositionsSnapshot;
  return (
    Number.isFinite(Date.parse(snapshot.fetchedAt)) &&
    (snapshot.refreshAfterMs === undefined ||
      (Number.isFinite(snapshot.refreshAfterMs) &&
        snapshot.refreshAfterMs >= 0 &&
        snapshot.refreshAfterMs <= TRAIN_POSITIONS_INTERVAL)) &&
    Array.isArray(snapshot.trains) &&
    snapshot.trains.every(
      (train) =>
        train &&
        typeof train.id === 'string' &&
        train.id.startsWith('odpt.Train:Toei.') &&
        ['Asakusa', 'Mita', 'Shinjuku', 'Oedo'].includes(train.railwayId) &&
        typeof train.direction === 'string' &&
        typeof train.fromStation === 'string' &&
        (train.toStation === null || typeof train.toStation === 'string') &&
        Number.isFinite(Date.parse(train.updatedAt)) &&
        Number.isFinite(Date.parse(train.validUntil)) &&
        (train.trainType === undefined || typeof train.trainType === 'string') &&
        (train.destinationStation === undefined ||
          (typeof train.destinationStation === 'string' &&
            train.destinationStation.startsWith('odpt.Station:'))) &&
        (train.delay === undefined || (Number.isFinite(train.delay) && train.delay >= 0)),
    )
  );
}

export function validTrainPositions(value: unknown): value is TrainPositionsSnapshot {
  return (
    validPositionRows(value) &&
    (value.collected == null || validCollectedPositions(value.collected))
  );
}

export function validCollectedPositions(value: unknown): value is CollectedPositions {
  if (!validPositionRows(value) || 'collected' in value) return false;
  return (value.trains as CollectedTrainPosition[]).every(
    ({ id, model, projection, vicinityArrival, toStation }) =>
      (vicinityArrival === undefined ||
        (vicinityArrival !== null &&
          typeof toStation === 'string' &&
          vicinityArrival.station === toStation &&
          Number.isSafeInteger(vicinityArrival.at))) &&
      (model === undefined ||
        (model != null &&
          projection != null &&
          typeof model.runId === 'string' &&
          model.runId.split('/')[1] === id &&
          Number.isFinite(model.visit) &&
          Number.isFinite(model.nextVisit) &&
          model.nextVisit > model.visit &&
          (model.lead === 45000 || model.lead === 60000) &&
          Number.isFinite(model.dwellUntil) &&
          (model.usualExit === undefined || Number.isFinite(model.usualExit)) &&
          (model.entryLag === undefined ||
            (Number.isFinite(model.entryLag) && model.entryLag >= 0)))) &&
      (projection === undefined ||
        (projection != null &&
          Number.isFinite(projection.at) &&
          typeof projection.fromStation === 'string' &&
          (projection.toStation === null || typeof projection.toStation === 'string'))),
  );
}
