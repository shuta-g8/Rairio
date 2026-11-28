import { useLayoutEffect, useRef, useState } from 'react';
import type { Departure } from '../types';
import { departureIdentity } from '../lib/time';
import type { ToeiSpecialCall } from '../lib/toei-special-calls';

export const TOEI_FLIP_HALF_MS = 1500;
const TOEI_NEXT_FLIP_MAX_DELAY_MS = 3000;

type FlipState<T> =
  | { shown: T; phase?: undefined; startedAt?: never }
  | { shown: T; phase: 'out' | 'in'; startedAt: number };

export type ToeiBoardRow = Departure | ToeiSpecialCall;

export function toeiBoardRowIdentity(row: ToeiBoardRow) {
  return 'kind' in row ? `${row.kind}/${row.trainId}` : departureIdentity(row);
}

export function toeiBoardRowTime(row: ToeiBoardRow) {
  return 'kind' in row ? row.at : row.timestamp;
}

type FlipOptions = {
  firstFlipStart?: number | 'pending';
  animateEarlierChange?: boolean;
  settleImmediately?: boolean;
};

/** One timer and one displayed row; coalesce updates before the edge-on swap. */
export function useToeiDepartureFlip<T extends ToeiBoardRow | undefined>(
  departure: T,
  { firstFlipStart, animateEarlierChange = false, settleImmediately = false }: FlipOptions = {},
) {
  const identity = departure && toeiBoardRowIdentity(departure);
  const latest = useRef(departure);
  const resumed = useRef(false);
  latest.current = departure;
  const [state, setState] = useState<FlipState<T>>(() => ({ shown: departure }));
  const matchesShown = identity === (state.shown && toeiBoardRowIdentity(state.shown));
  const replaceImmediately =
    settleImmediately ||
    !departure ||
    !state.shown ||
    // Withdraw an observed special call as soon as its evidence or row assignment changes.
    ('kind' in state.shown && !matchesShown) ||
    // A newly confirmed call and the row it pushes back use the normal flip.
    (!animateEarlierChange &&
      !('kind' in departure) &&
      toeiBoardRowTime(departure) < toeiBoardRowTime(state.shown));

  useLayoutEffect(() => {
    // The clock publishes the resumed board in the same render. The visibility
    // listener still holds the train from before suspension.
    if (resumed.current) {
      resumed.current = false;
      if (!matchesShown || state.phase) setState({ shown: latest.current });
      return;
    }
    // Apply ordinary earlier-train corrections without replaying a departure turnover.
    if (replaceImmediately || (state.phase === 'out' && matchesShown)) {
      if (!matchesShown || state.phase) setState({ shown: latest.current });
      return;
    }
    if (matchesShown || state.phase) return;
    if (
      document.visibilityState === 'hidden' ||
      matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
      setState({ shown: latest.current });
      return;
    }
    if (firstFlipStart === 'pending') return;
    const start = () =>
      setState({ shown: state.shown, phase: 'out', startedAt: performance.now() });
    const delay =
      firstFlipStart === undefined
        ? 0
        : firstFlipStart + Math.random() * TOEI_NEXT_FLIP_MAX_DELAY_MS - performance.now();
    if (delay <= 0) {
      start();
      return;
    }
    const timer = window.setTimeout(start, delay);
    return () => window.clearTimeout(timer);
  }, [state, matchesShown, replaceImmediately, firstFlipStart]);

  useLayoutEffect(() => {
    if (!state.phase) return;
    // Wall-clock corrections must not lengthen either half of the rotation.
    const deadline = state.startedAt + TOEI_FLIP_HALF_MS * (state.phase === 'out' ? 1 : 2);
    const timer = window.setTimeout(
      () => {
        setState((current) =>
          current.phase === 'out'
            ? { shown: latest.current, phase: 'in', startedAt: current.startedAt }
            : { shown: current.shown },
        );
      },
      Math.max(0, deadline - performance.now()),
    );
    return () => window.clearTimeout(timer);
  }, [state.phase, state.startedAt]);

  useLayoutEffect(() => {
    const media = matchMedia('(prefers-reduced-motion: reduce)');
    const settle = () => {
      if (media.matches) setState({ shown: latest.current });
    };
    media.addEventListener('change', settle);
    return () => {
      media.removeEventListener('change', settle);
    };
  }, []);

  useLayoutEffect(() => {
    let visibility = document.visibilityState;
    const settleOnTabChange = () => {
      if (visibility === document.visibilityState) return;
      visibility = document.visibilityState;
      resumed.current = visibility === 'visible';
      setState({ shown: latest.current });
    };
    document.addEventListener('visibilitychange', settleOnTabChange);
    return () => document.removeEventListener('visibilitychange', settleOnTabChange);
  }, []);

  return {
    departure: replaceImmediately || (!state.phase && matchesShown) ? departure : state.shown,
    phase: replaceImmediately ? undefined : state.phase,
    startedAt: replaceImmediately ? undefined : state.startedAt,
    pending: !replaceImmediately && !matchesShown && state.phase !== 'out',
  };
}
