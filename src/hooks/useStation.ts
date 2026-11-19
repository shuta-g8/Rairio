import { useCallback, useEffect, useState, useRef } from 'react';
import { fetchStation } from '../lib/data';
import type { StationData } from '../types';
import { editionServiceDate } from '../../shared/timetable-editions';
import { reuseUnchangedRoutes } from '../lib/station-refresh';

const REFRESH_INTERVAL = 30 * 60_000;

export function useStation(stationId: string) {
  const [data, setData] = useState<StationData | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);
  const loadedFor = useRef<string | null>(null);
  const refresh = useCallback(() => setRevision((value) => value + 1), []);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(loadedFor.current !== stationId);
    setError('');
    setData((previous) => (previous?.id === stationId ? previous : null));
    fetchStation(stationId, controller.signal)
      .then((value) => {
        if (controller.signal.aborted) return;
        loadedFor.current = stationId;
        setData((previous) => reuseUnchangedRoutes(previous, value));
      })
      .catch((reason) => {
        if (!controller.signal.aborted) {
          setError(reason instanceof Error ? reason.message : '時刻表を読み込めませんでした。');
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [stationId, revision]);

  useEffect(() => {
    const timer = window.setInterval(refresh, REFRESH_INTERVAL);
    let date = editionServiceDate(Date.now());
    const boundary = window.setInterval(() => {
      const next = editionServiceDate(Date.now());
      if (next !== date) {
        date = next;
        refresh();
      }
    }, 1000);
    const resume = () => {
      if (document.visibilityState === 'visible') refresh();
    };
    document.addEventListener('visibilitychange', resume);
    window.addEventListener('online', refresh);
    navigator.serviceWorker?.addEventListener('controllerchange', refresh);
    return () => {
      clearInterval(timer);
      clearInterval(boundary);
      document.removeEventListener('visibilitychange', resume);
      window.removeEventListener('online', refresh);
      navigator.serviceWorker?.removeEventListener('controllerchange', refresh);
    };
  }, [refresh]);

  return { data, error, loading, refresh };
}
