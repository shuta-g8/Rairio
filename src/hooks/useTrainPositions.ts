import { useEffect, useState } from 'react';
import {
  TRAIN_POSITIONS_INTERVAL,
  validTrainPositions,
  type TrainPositionsSnapshot,
} from '../../shared/train-positions';

/** One request shared by all displayed boards; never persist or reuse failed position data. */
export function useTrainPositions(enabled: boolean) {
  const [snapshot, setSnapshot] = useState<TrainPositionsSnapshot | null>(null);
  useEffect(() => {
    if (!enabled) {
      setSnapshot(null);
      return;
    }
    let disposed = false;
    let controller: AbortController | undefined;
    let timer: number | undefined;
    let nextAt = 0;
    let collecting = false;
    const clearSnapshot = () =>
      setSnapshot(
        collecting ? { fetchedAt: new Date().toISOString(), trains: [], collected: null } : null,
      );
    const scheduleRefresh = () => {
      clearTimeout(timer);
      timer = window.setTimeout(() => void refresh(), Math.max(0, nextAt - performance.now()));
    };
    const refresh = async () => {
      if (disposed || controller || !navigator.onLine || document.visibilityState !== 'visible')
        return;
      clearTimeout(timer);
      // Use elapsed time so wall-clock corrections cannot extend the polling cycle.
      const remaining = nextAt - performance.now();
      if (remaining > 0) {
        scheduleRefresh();
        return;
      }
      const request = new AbortController();
      controller = request;
      const timeout = window.setTimeout(() => request.abort(), 10000);
      nextAt = performance.now() + TRAIN_POSITIONS_INTERVAL;
      try {
        const response = await fetch(`${import.meta.env.BASE_URL}api/train-positions`, {
          cache: 'no-store',
          signal: request.signal,
        });
        if (!response.ok) throw new Error('Positions unavailable');
        const data: unknown = await response.json();
        if (!validTrainPositions(data)) throw new Error('Invalid positions');
        if (!disposed && !request.signal.aborted) {
          collecting = data.collected !== undefined;
          setSnapshot(data);
          // Wait until the server cache expires, but never start requests less
          // than 30 seconds apart. Older servers retain the previous safe cadence.
          nextAt = Math.max(
            nextAt,
            performance.now() + (data.refreshAfterMs ?? TRAIN_POSITIONS_INTERVAL),
          );
        }
      } catch {
        if (!disposed) clearSnapshot();
      } finally {
        clearTimeout(timeout);
        controller = undefined;
        if (!disposed && navigator.onLine) scheduleRefresh();
      }
    };
    const resume = () => {
      if (performance.now() >= nextAt) void refresh();
    };
    const offline = () => {
      nextAt = 0;
      clearTimeout(timer);
      controller?.abort();
      clearSnapshot();
    };
    void refresh();
    document.addEventListener('visibilitychange', resume);
    window.addEventListener('online', resume);
    window.addEventListener('offline', offline);
    return () => {
      disposed = true;
      clearTimeout(timer);
      controller?.abort();
      document.removeEventListener('visibilitychange', resume);
      window.removeEventListener('online', resume);
      window.removeEventListener('offline', offline);
    };
  }, [enabled]);
  return snapshot;
}
