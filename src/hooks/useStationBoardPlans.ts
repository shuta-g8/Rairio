import { useEffect, useMemo, useState } from 'react';
import {
  acceptStationBoardPlan,
  DEPARTURE_BOARD_MAX_BYTES,
  DEPARTURE_BOARD_REFRESH_MS,
  readStationBoardPlan,
  stationBoardNextPollAt,
  type CurrentDepartureBoard,
  type StationBoardSample,
} from '../../shared/departure-board.ts';

const REQUEST_TIMEOUT_MS = 10_000;

export interface StationBoardPlans {
  now: Date | undefined;
  routes: Record<string, CurrentDepartureBoard>;
}

const empty: StationBoardPlans = { now: undefined, routes: {} };

/** One visibility-aware request per station; keep the last plan only through its lease. */
export function useStationBoardPlans(
  stationId: string | undefined,
  enabled: boolean,
): StationBoardPlans {
  const scope = useMemo(
    () => (enabled && stationId ? { stationId } : undefined),
    [stationId, enabled],
  );
  const [view, setView] = useState<{ scope: typeof scope; boards: StationBoardPlans }>();

  useEffect(() => {
    if (!scope) return;
    const station = scope.stationId;
    const query = new URLSearchParams({ station });
    const url = `${import.meta.env.BASE_URL}api/departure-board?${query}`;
    let sample: StationBoardSample | undefined;
    let request: AbortController | undefined;
    let poll: number | undefined;
    let tick: number | undefined;
    let nextPollAt = 0;
    let disposed = false;
    const visible = () => !disposed && document.visibilityState === 'visible';

    function updateClock() {
      window.clearTimeout(tick);
      if (!visible() || !sample) return;
      const monotonicNow = performance.now();
      const active = readStationBoardPlan(sample, monotonicNow);
      if (!active) {
        setView(undefined);
        return;
      }
      const { serverTime, nextChangeAt, routes } = active;
      setView({ scope, boards: { now: new Date(serverTime), routes } });
      const wait = Math.min(1_000 - (serverTime % 1_000), nextChangeAt - monotonicNow);
      tick = window.setTimeout(updateClock, Math.max(1, Math.ceil(wait)));
    }

    function schedulePoll() {
      window.clearTimeout(poll);
      if (visible() && navigator.onLine && !request) {
        poll = window.setTimeout(
          () => void refresh(),
          Math.max(0, Math.ceil(nextPollAt - performance.now())),
        );
      }
    }

    async function refresh() {
      window.clearTimeout(poll);
      if (!visible() || !navigator.onLine || request) return;
      const sentAt = performance.now();
      if (sentAt < nextPollAt) {
        schedulePoll();
        return;
      }
      const controller = new AbortController();
      request = controller;
      nextPollAt = sentAt + DEPARTURE_BOARD_REFRESH_MS;
      const timeout = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
      try {
        const response = await fetch(url, { cache: 'no-store', signal: controller.signal });
        if (
          !response.ok ||
          Number(response.headers.get('content-length')) > DEPARTURE_BOARD_MAX_BYTES
        )
          return;
        const text = await response.text();
        if (
          !visible() ||
          !navigator.onLine ||
          controller.signal.aborted ||
          text.length > DEPARTURE_BOARD_MAX_BYTES ||
          new TextEncoder().encode(text).byteLength > DEPARTURE_BOARD_MAX_BYTES
        )
          return;
        const value: unknown = JSON.parse(text);
        const accepted = acceptStationBoardPlan(value, station, sentAt, performance.now(), sample);
        if (accepted) {
          sample = accepted;
          nextPollAt = stationBoardNextPollAt(accepted, sentAt);
          updateClock();
        }
      } catch {
        // A failed refresh leaves the earlier plan and clock on their original leases.
      } finally {
        window.clearTimeout(timeout);
        request = undefined;
        schedulePoll();
      }
    }

    function onActivity() {
      if (!visible() || !navigator.onLine) {
        window.clearTimeout(poll);
        request?.abort();
      }
      if (visible()) {
        updateClock();
        void refresh();
      } else {
        window.clearTimeout(tick);
      }
    }

    void refresh();
    document.addEventListener('visibilitychange', onActivity);
    window.addEventListener('pageshow', onActivity);
    window.addEventListener('online', onActivity);
    window.addEventListener('offline', onActivity);
    return () => {
      disposed = true;
      window.clearTimeout(poll);
      window.clearTimeout(tick);
      request?.abort();
      document.removeEventListener('visibilitychange', onActivity);
      window.removeEventListener('pageshow', onActivity);
      window.removeEventListener('online', onActivity);
      window.removeEventListener('offline', onActivity);
    };
  }, [scope]);

  return scope && view?.scope === scope ? view.boards : empty;
}
