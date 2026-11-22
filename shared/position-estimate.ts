import {
  TRAIN_POSITION_MAX_AGE,
  type CollectedTrainPosition,
  type TrainPosition,
} from './train-positions.ts';

export interface PositionEstimate {
  runId: string;
  visit: number;
  fromStation: string;
  toStation: string | null;
  delaySeconds: number;
  evidence?: {
    firstDirect: number;
    firstCollected: number;
    confirmed: boolean;
    at: number;
    lag: number;
    stalled: boolean;
    phase: number;
  };
}

export function positionAdvanceAt(
  { model, projection }: CollectedTrainPosition,
  { evidence, delaySeconds }: Pick<PositionEstimate, 'evidence' | 'delaySeconds'>,
) {
  if (
    !model ||
    !projection ||
    (evidence?.confirmed && evidence.stalled && evidence.phase === model.visit)
  )
    return;
  if (delaySeconds <= 0) return projection.at;
  // The phase entry already includes accumulated lateness. Shift the historical exit when known.
  const delayMs = delaySeconds * 1000;
  return model.usualExit === undefined
    ? projection.at + Math.min(model.lead, delayMs)
    : Math.max(projection.at, model.usualExit + delayMs - model.lead);
}

/** Both inputs are observations on the source clock. Only the last step uses the display lead. */
export function estimatePosition(
  p: CollectedTrainPosition,
  direct: TrainPosition | undefined,
  now: number,
  previous?: PositionEstimate,
): PositionEstimate | undefined {
  const { model, projection } = p;
  if (!model || !projection) return;
  const prior = previous?.runId === model.runId ? previous : undefined;
  let evidence = prior?.evidence;
  if (evidence && now - evidence.at >= TRAIN_POSITION_MAX_AGE) evidence = undefined;
  const rawAt = direct && Date.parse(direct.updatedAt);
  const collectedAt = Date.parse(p.updatedAt);
  if (
    direct &&
    rawAt !== undefined &&
    rawAt <= now &&
    direct.id === p.id &&
    direct.railwayId === p.railwayId &&
    direct.direction === p.direction &&
    direct.fromStation === p.fromStation &&
    direct.toStation === p.toStation
  ) {
    // Both sources must still place this run in this phase. Use the earlier timestamp
    // so a newer poll alone cannot turn ordinary polling skew into a delay.
    const at = Math.min(rawAt, collectedAt);
    const threshold = model.lead === 45000 ? 90000 : 60000;
    const dwellLag = at - model.dwellUntil;
    const lag = Math.max(dwellLag, model.entryLag ?? 0, at - (model.usualExit ?? at));
    if (!evidence || at >= evidence.at) {
      if (lag < threshold) evidence = undefined;
      else {
        const continuous =
          evidence && at - evidence.at < TRAIN_POSITION_MAX_AGE ? evidence : undefined;
        const firstDirect = continuous?.firstDirect ?? rawAt;
        const firstCollected = continuous?.firstCollected ?? collectedAt;
        evidence = {
          firstDirect,
          firstCollected,
          confirmed: rawAt - firstDirect >= 20000 && collectedAt - firstCollected >= 20000,
          at,
          lag,
          stalled: dwellLag >= threshold,
          phase: model.visit,
        };
      }
    }
  }
  const confirmed = evidence?.confirmed ? evidence : undefined;
  const reported = Math.max(
    p.delay ?? 0,
    rawAt !== undefined && rawAt <= now ? (direct?.delay ?? 0) : 0,
  );
  const delaySeconds = Math.max(reported, Math.floor((confirmed?.lag ?? 0) / 1000));
  const advanceAt = positionAdvanceAt(p, { evidence, delaySeconds });
  const advance = advanceAt !== undefined && now >= advanceAt;
  const selected = advance ? projection : p;
  const visit = advance ? model.nextVisit : model.visit;
  const floor = prior && prior.visit > visit ? prior : undefined;
  return {
    runId: model.runId,
    visit: floor?.visit ?? visit,
    fromStation: floor ? floor.fromStation : selected.fromStation,
    toStation: floor ? floor.toStation : selected.toStation,
    evidence,
    delaySeconds,
  };
}
