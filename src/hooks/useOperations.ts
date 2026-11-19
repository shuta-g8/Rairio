import { useCallback, useEffect, useRef, useState } from 'react';
import { OPERATIONS_INTERVAL, type OperationsSnapshot } from '../../shared/railways';
import {
  loadOperations,
  operationsRefreshDelay,
  saveOperations,
  validSnapshot,
} from '../lib/operations';

export function useOperations() {
  const [snapshot, setSnapshot] = useState<OperationsSnapshot | null>(loadOperations);
  const [online, setOnline] = useState(() => navigator.onLine);
  const [loading, setLoading] = useState(false);
  const [current, setCurrent] = useState(false);
  const controller = useRef<AbortController | null>(null);
  const refreshTimer = useRef<number | undefined>(undefined);
  const nextRefreshAt = useRef(0);

  const refresh = useCallback(async (): Promise<void> => {
    clearTimeout(refreshTimer.current);
    controller.current?.abort();
    const request = new AbortController();
    controller.current = request;
    // A resumed page can receive pageshow, focus and visibilitychange together.
    // Set the next deadline before fetching so they do not start duplicate requests.
    nextRefreshAt.current = Date.now() + OPERATIONS_INTERVAL;
    if (!navigator.onLine) {
      controller.current = null;
      setOnline(false);
      setCurrent(false);
      setLoading(false);
      return;
    }
    setLoading(true);
    let delay = OPERATIONS_INTERVAL;
    const timer = window.setTimeout(() => request.abort(), 10000);
    try {
      const response = await fetch(`${import.meta.env.BASE_URL}api/operations`, {
        signal: request.signal,
        cache: 'no-store',
      });
      if (!response.ok) throw new Error('運行情報を取得できません');
      const value: unknown = await response.json();
      if (!validSnapshot(value)) throw new Error('運行情報の形式が不正です');
      if (controller.current !== request || request.signal.aborted) return;
      setSnapshot(value);
      setCurrent(!value.cached);
      saveOperations(value);
      delay = operationsRefreshDelay(value, Date.now());
    } catch {
      // An aborted older request must not overwrite a newer successful response.
      if (controller.current === request) setCurrent(false);
    } finally {
      clearTimeout(timer);
      if (controller.current === request) {
        controller.current = null;
        setLoading(false);
        nextRefreshAt.current = Date.now() + delay;
        if (navigator.onLine) refreshTimer.current = window.setTimeout(() => void refresh(), delay);
      }
    }
  }, []);

  useEffect(() => {
    void refresh();
    const connected = () => {
      setOnline(true);
      void refresh();
    };
    const disconnected = () => {
      clearTimeout(refreshTimer.current);
      controller.current?.abort();
      controller.current = null;
      setOnline(false);
      setCurrent(false);
      setLoading(false);
    };
    const visible = () => {
      if (document.visibilityState === 'visible' && Date.now() >= nextRefreshAt.current)
        void refresh();
    };
    window.addEventListener('online', connected);
    window.addEventListener('offline', disconnected);
    window.addEventListener('focus', visible);
    window.addEventListener('pageshow', visible);
    document.addEventListener('visibilitychange', visible);
    return () => {
      clearTimeout(refreshTimer.current);
      controller.current?.abort();
      controller.current = null;
      window.removeEventListener('online', connected);
      window.removeEventListener('offline', disconnected);
      window.removeEventListener('focus', visible);
      window.removeEventListener('pageshow', visible);
      document.removeEventListener('visibilitychange', visible);
    };
  }, [refresh]);
  return { snapshot, online, loading, current, refresh };
}
