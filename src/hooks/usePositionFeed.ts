import { useEffect, useState } from 'react';
import { FeedReceiver, FEED_MAX_IDS, filterPositions } from '../../shared/position-feed';
import { validTrainPositions, type TrainPositionsSnapshot } from '../../shared/train-positions';
import { liveDepartureCandidates, serviceDate } from '../lib/time';
import { timetableEditionForDate } from '../../shared/timetable-editions';
import type { Route } from '../types';

export function positionFeedIds(routes: Route[], now: Date): string[] {
  const ids = new Set<string>();
  for (const route of routes) {
    if (!route.railwayId) continue;
    let future = 0;
    for (const train of liveDepartureCandidates(route, now, 15 * 60000 + 30000)) {
      if (train.timestamp > now.getTime() + 20 * 60000 && future >= 2) break;
      if (train.timestamp >= now.getTime()) future++;
      if (train.trainId) ids.add(train.trainId);
    }
  }
  // Never silently truncate a subscription; a missing train could change turnover.
  return ids.size > FEED_MAX_IDS ? [] : [...ids].sort();
}

export function usePositionFeed(enabled: boolean, routes: Route[]) {
  const [clock, setClock] = useState<number>();
  const [snapshot, setSnapshot] = useState<TrainPositionsSnapshot | null>(null);
  const [mode, setMode] = useState('starting');
  useEffect(() => {
    if (!enabled) {
      setClock(undefined);
      return;
    }
    const update = () => {
      if (document.visibilityState === 'visible') setClock(Date.now());
    };
    update();
    const timer = window.setInterval(update, 30000);
    document.addEventListener('visibilitychange', update);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', update);
    };
  }, [enabled]);
  const now = enabled && clock !== undefined ? new Date(clock) : undefined;
  const key = now ? positionFeedIds(routes, now).join(',') : '';
  const date = now ? serviceDate(now) : undefined;
  // The Pages endpoint supplies the destination needed for GTFS matching even
  // when the independently deployed streaming worker still uses its old schema.
  const pollForGtfs = !!date && routes.some((route) => timetableEditionForDate(route, date)?.gtfs);
  useEffect(() => {
    if (!enabled || !key) {
      setSnapshot(null);
      setMode('idle');
      return;
    }
    const ids = key.split(',');
    setMode('starting');
    // Keep a still-valid server frame for overlapping trains while the new
    // subscription joins the next tick. Never inherit an old local estimate.
    setSnapshot((last) =>
      last?.serverEstimates && last.serverEstimates.validUntil > Date.now()
        ? filterPositions(last, ids)
        : null,
    );
    const query = new URLSearchParams(ids.map((id) => ['id', id]));
    const url = `${import.meta.env.BASE_URL}api/position-feed?${query}`;
    const fallbackUrl = `${import.meta.env.BASE_URL}api/train-positions?${query}`;
    let disposed = false,
      healthy = false;
    let source: EventSource | undefined, controller: AbortController | undefined;
    let watch: number | undefined, retry: number | undefined, poll: number | undefined;
    let nextPoll = 0,
      failures = 0;
    const visible = () => !disposed && navigator.onLine && document.visibilityState === 'visible';
    const stopStream = () => {
      source?.close();
      source = undefined;
      clearTimeout(watch);
      healthy = false;
    };
    const refresh = async () => {
      if (!visible() || healthy || controller) return;
      clearTimeout(poll);
      if (performance.now() < nextPoll) {
        poll = window.setTimeout(() => void refresh(), nextPoll - performance.now());
        return;
      }
      const request = new AbortController();
      controller = request;
      const timeout = window.setTimeout(() => request.abort(), 10000);
      nextPoll = performance.now() + 30000;
      try {
        const response = await fetch(fallbackUrl, { cache: 'no-store', signal: request.signal });
        const value: unknown = await response.json();
        if (!response.ok || !validTrainPositions(value)) throw Error('Unavailable');
        if (!disposed && !healthy && !request.signal.aborted) {
          // HTTP is the local-computation path, even if a future server adds estimates.
          const { serverEstimates: _unused, ...observed } = value;
          setSnapshot(observed);
          setMode('fallback');
          nextPoll = Math.max(nextPoll, performance.now() + (value.refreshAfterMs ?? 30000));
        }
      } catch {
        if (visible() && !source) {
          setSnapshot(null);
          setMode('unavailable');
        }
      } finally {
        clearTimeout(timeout);
        controller = undefined;
        if (visible() && !source)
          poll = window.setTimeout(() => void refresh(), Math.max(0, nextPoll - performance.now()));
      }
    };
    const fail = () => {
      stopStream();
      setMode('fallback');
      // Remove authority immediately; retain observations to seed the same local estimator.
      setSnapshot((value) => {
        if (!value) return value;
        const { serverEstimates: _unused, ...observed } = value;
        return observed;
      });
      void refresh();
      clearTimeout(retry);
      // Explicit backoff, not EventSource's unbounded automatic reconnect loop.
      retry = window.setTimeout(
        connect,
        Math.min(300000, 30000 * 2 ** Math.min(failures++, 4)) + Math.random() * 3000,
      );
    };
    const connect = () => {
      if (!visible()) return;
      if (pollForGtfs) {
        void refresh();
        return;
      }
      clearTimeout(retry);
      stopStream();
      const receiver = new FeedReceiver(ids);
      let current: EventSource;
      try {
        current = new EventSource(url);
      } catch {
        fail();
        return;
      }
      source = current;
      watch = window.setTimeout(fail, 10000);
      current.addEventListener('positions', (event) => {
        if (disposed || source !== current) return;
        try {
          const data = (event as MessageEvent).data;
          if (data.length > 262144) throw Error('Oversized feed');
          const value = receiver.accept(JSON.parse(data), Date.now());
          healthy = true;
          failures = 0;
          clearTimeout(poll);
          clearTimeout(watch);
          controller?.abort();
          setSnapshot(value);
          setMode('sse');
          watch = window.setTimeout(fail, 15000);
        } catch {
          fail();
        }
      });
      current.onerror = () => {
        if (source === current && !disposed) fail();
      };
    };
    const resume = () => {
      if (visible()) {
        if (!source) {
          setMode('starting');
          connect();
        }
      } else {
        stopStream();
        clearTimeout(retry);
        clearTimeout(poll);
        controller?.abort();
        setSnapshot(null);
        setMode(navigator.onLine ? 'paused' : 'offline');
      }
    };
    connect();
    document.addEventListener('visibilitychange', resume);
    window.addEventListener('online', resume);
    window.addEventListener('offline', resume);
    return () => {
      disposed = true;
      stopStream();
      clearTimeout(retry);
      clearTimeout(poll);
      controller?.abort();
      document.removeEventListener('visibilitychange', resume);
      window.removeEventListener('online', resume);
      window.removeEventListener('offline', resume);
    };
  }, [enabled, key, pollForGtfs]);
  return { snapshot, mode, active: enabled && routes.some((route) => route.railwayId) };
}
