import { TRAIN_POSITION_MAX_AGE, type TrainPosition } from '../../shared/train-positions.ts';
import type { PositionEstimate } from '../../shared/position-estimate.ts';

export const TRAIN_DELAY_LIMITS = {
  maxDelayMs: 10 * 60_000,
  delayConfirmationMs: 20_000,
  delayRetentionMs: 5 * 60_000,
} as const;

export interface TrainDelayState {
  pendingDelay?: { value: number; firstAt: number };
  delayMs: number;
  delayUntil: number;
  estimatedDelayMs?: number;
  estimatedDelaySourceAt?: number;
}

/** Called once per new, accepted position. Only a local observation supplies a delay. */
export function updateObservedDelay(
  state: TrainDelayState,
  delaySeconds: number | undefined,
  sourceAt: number,
  scheduledSwitchAt: number,
  hardStop: number,
) {
  const delay = delaySeconds === undefined ? undefined : delaySeconds * 1000;
  const hasDelay = state.delayMs > 0 || (state.estimatedDelayMs ?? 0) > 0;
  if (
    delay === undefined ||
    !Number.isSafeInteger(delay) ||
    delay < 0 ||
    delay > TRAIN_DELAY_LIMITS.maxDelayMs ||
    (delay === 0 && !hasDelay)
  ) {
    state.pendingDelay = undefined;
    return;
  }
  const pending = state.pendingDelay;
  if (pending?.value !== delay || sourceAt - pending.firstAt > TRAIN_POSITION_MAX_AGE) {
    state.pendingDelay = { value: delay, firstAt: sourceAt };
    return;
  }
  if (sourceAt - pending.firstAt < TRAIN_DELAY_LIMITS.delayConfirmationMs) return;

  state.pendingDelay = { value: delay, firstAt: sourceAt };
  state.delayMs = delay === 0 ? 0 : Math.max(state.delayMs, delay);
  state.delayUntil = Math.min(
    hardStop,
    Math.max(sourceAt + TRAIN_DELAY_LIMITS.delayRetentionMs, scheduledSwitchAt + state.delayMs),
  );
  if (delay === 0 && sourceAt > (state.estimatedDelaySourceAt ?? -Infinity)) {
    state.estimatedDelayMs = 0;
    state.estimatedDelaySourceAt = sourceAt;
  }
}

interface DelayForecast {
  estimate: Pick<PositionEstimate, 'runId' | 'delaySeconds'>;
  sourceAt: number;
  sourceDelay?: number;
}

/** A zero estimate can mean that neither source supplied a delay. Only a newer explicit zero
 * clears a held estimate for this run, after checking reports at that source timestamp agree. */
export function updateEstimatedDelay(
  state: TrainDelayState,
  forecast: DelayForecast,
  previousRunId: string | undefined,
  direct: TrainPosition | undefined,
) {
  if (forecast.estimate.runId !== previousRunId) {
    state.estimatedDelayMs = 0;
    state.estimatedDelaySourceAt = undefined;
  }
  const priorDelayAt = state.estimatedDelaySourceAt ?? -Infinity;
  const directAt = direct?.delay === undefined ? -Infinity : Date.parse(direct.updatedAt);
  const delaySeconds = forecast.estimate.delaySeconds;
  if (delaySeconds > 0) {
    const estimateAt = Math.max(forecast.sourceAt, direct?.delay ? directAt : -Infinity);
    if (estimateAt >= priorDelayAt) {
      state.estimatedDelayMs = delaySeconds * 1000;
      state.estimatedDelaySourceAt = estimateAt;
    }
    return;
  }
  const collectedAt = forecast.sourceDelay === undefined ? -Infinity : forecast.sourceAt;
  const reportAt = Math.max(directAt, collectedAt);
  if (
    delaySeconds === 0 &&
    reportAt > priorDelayAt &&
    (directAt < reportAt || direct?.delay === 0) &&
    (collectedAt < reportAt || forecast.sourceDelay === 0)
  ) {
    state.estimatedDelayMs = 0;
    state.estimatedDelaySourceAt = reportAt;
  }
}
