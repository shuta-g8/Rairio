import { useLayoutEffect, useRef, useState } from 'react';
import type { Departure } from '../types';
import { departureIdentity } from '../lib/time';

export const TOEI_FLIP_HALF_MS = 1500;

type FlipState<T> =
  | { shown: T; phase?: undefined; startedAt?: never }
  | { shown: T; phase: 'out' | 'in'; startedAt: number };

/** One timer and one displayed row; coalesce updates before the edge-on swap. */
export function useToeiDepartureFlip<T extends Departure | undefined>(departure: T) {
  const identity = departure && departureIdentity(departure);
  const latest = useRef(departure);
  const resumed = useRef(false);
  latest.current = departure;
  const [state, setState] = useState<FlipState<T>>(() => ({ shown: departure }));
  const matchesShown = identity === (state.shown && departureIdentity(state.shown));
  const replaceImmediately =
    !departure || !state.shown || departure.timestamp < state.shown.timestamp;

  useLayoutEffect(() => {
    // The clock publishes the resumed board in the same render. The visibility
    // listener still holds the train from before suspension.
    if (resumed.current) {
      resumed.current = false;
      if (!matchesShown || state.phase) setState({ shown: latest.current });
      return;
    }
    // A correction to an earlier retained train is not a departure turnover.
    // Never keep the later row visible while rotating back to the correct one.
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
    setState({ shown: state.shown, phase: 'out', startedAt: performance.now() });
  }, [identity, state, matchesShown, replaceImmediately]);

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
  };
}
