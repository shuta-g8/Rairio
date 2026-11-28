import {
  TRAIN_POSITION_MAX_AGE,
  trainPositionIsFresh,
  type CollectedTrainPosition,
  type TrainPosition,
} from './train-positions.ts';

export interface PositionEstimate {
  runId: string;
  visit: number;
  fromStation: string;
  toStation: string | null;
  delaySeconds: number;
  /** Last collector observation behind this diagram, independent of the displayed visit. */
  observation?: { at: number; visit: number; lowerDecileAt?: number };
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
  const displayAdvance = projection.advanceMs ?? 0;
  if (delaySeconds <= 0) return projection.at - displayAdvance;
  // The phase entry already includes accumulated lateness. Shift the historical exit when known.
  const delayMs = delaySeconds * 1000;
  const estimatedAt =
    model.usualExit === undefined
      ? projection.at + Math.min(model.lead, delayMs)
      : Math.max(projection.at, model.usualExit + delayMs - model.lead);
  return estimatedAt - displayAdvance;
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
  let evidence = prior?.evidence?.phase === model.visit ? prior.evidence : undefined;
  if (evidence && now - evidence.at >= TRAIN_POSITION_MAX_AGE) evidence = undefined;
  const rawAt = direct && Date.parse(direct.updatedAt);
  const collectedAt = Date.parse(p.updatedAt);
  if (!prior && previous?.observation && collectedAt <= previous.observation.at) return;
  const last = prior?.observation;
  if (
    last &&
    (collectedAt < last.at ||
      model.visit < last.visit ||
      (collectedAt === last.at && model.visit !== last.visit))
  )
    return prior;
  const matchedDirect =
    direct &&
    rawAt !== undefined &&
    rawAt <= now &&
    direct.id === p.id &&
    direct.railwayId === p.railwayId &&
    direct.direction === p.direction;
  const observedInPhase =
    matchedDirect && direct.fromStation === p.fromStation && direct.toStation === p.toStation;
  if (observedInPhase) {
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
  // Both feeds relay the same provider's report. A newer explicit zero can clear an old delay.
  let reported = p.delay ?? 0;
  if (matchedDirect && direct.delay !== undefined) {
    if (p.delay === undefined || rawAt > collectedAt) reported = direct.delay;
    else if (rawAt === collectedAt) reported = Math.max(reported, direct.delay);
  }
  const delaySeconds = Math.max(reported, Math.floor((confirmed?.lag ?? 0) / 1000));
  const advanceAt = positionAdvanceAt(p, { evidence, delaySeconds });
  // Only the moving segment's own station-entry distribution can constrain the diagram.
  // Keep the notice clock independent of this bound and of the diagram's display lead.
  const arrival = p.vicinityArrival;
  const lowerDecileAt =
    arrival &&
    p.toStation === arrival.station &&
    projection.fromStation === arrival.station &&
    projection.toStation === null
      ? arrival.lowerDecileAt
      : undefined;
  // Different transports may annotate the same observation at different times.
  const diagramAt =
    last?.at === collectedAt && last.lowerDecileAt !== undefined
      ? Math.max(last.lowerDecileAt, lowerDecileAt ?? -Infinity)
      : lowerDecileAt;
  const advance = advanceAt !== undefined && now >= Math.max(advanceAt, diagramAt ?? -Infinity);
  const selected = advance ? projection : p;
  const visit = advance ? model.nextVisit : model.visit;
  const refutedByArrivalBound =
    last &&
    diagramAt !== undefined &&
    now < diagramAt &&
    collectedAt > last.at &&
    collectedAt <= now &&
    trainPositionIsFresh(p, now) &&
    !(matchedDirect && rawAt >= collectedAt && !observedInPhase);
  const correctProjection =
    prior?.visit === model.nextVisit &&
    last?.visit === model.visit &&
    ((observedInPhase && confirmed?.stalled) || refutedByArrivalBound);
  const floor = prior && prior.visit > visit && !correctProjection ? prior : undefined;
  return {
    runId: model.runId,
    visit: floor?.visit ?? visit,
    fromStation: floor ? floor.fromStation : selected.fromStation,
    toStation: floor ? floor.toStation : selected.toStation,
    ...(floor && !last
      ? {}
      : {
          observation: {
            at: collectedAt,
            visit: model.visit,
            ...(diagramAt === undefined ? {} : { lowerDecileAt: diagramAt }),
          },
        }),
    evidence,
    delaySeconds,
  };
}
