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
  let advanceAt = projection.at;
  if (delaySeconds > 0) {
    // Today's phase entry already contains accumulated lateness. Shift the historical
    // exit, not today's entry, so the same delay is never added twice.
    advanceAt =
      model.usualExit === undefined
        ? advanceAt + Math.min(model.lead, delaySeconds * 1000)
        : Math.max(advanceAt, model.usualExit + delaySeconds * 1000 - model.lead);
  }
  const advance = now >= advanceAt && !(confirmed?.stalled && confirmed.phase === model.visit);
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
