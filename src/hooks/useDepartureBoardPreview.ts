import { useEffect, useState } from 'react';
import type { DepartureBoardDisplay } from '../lib/live-departures';

interface BoardFrame {
  at: number;
  display: DepartureBoardDisplay;
}

interface BoardPlan {
  version: 1;
  generatedAt: number;
  validUntil: number;
  frames: BoardFrame[];
}

type Transport = 'connecting' | 'sse' | 'http' | 'unavailable';

const REFRESH_MS = 2_000;
const STREAM_TIMEOUT_MS = 6_000;

function isBoardFrame(frame: BoardFrame) {
  const board = frame?.display?.board;
  return (
    Number.isSafeInteger(frame?.at) &&
    (board?.kind === 'empty' ||
      (board?.kind === 'ended' && Number.isFinite(board.nextDeparture?.timestamp)) ||
      (board?.kind === 'active' &&
        Array.isArray(board.departures) &&
        board.departures.length > 0 &&
        board.departures.every((departure) => Number.isFinite(departure?.timestamp))))
  );
}

function isBoardPlan(value: unknown, now: number): value is BoardPlan {
  if (!value || typeof value !== 'object') return false;
  const { version, generatedAt, validUntil, frames } = value as BoardPlan;
  return (
    version === 1 &&
    Number.isSafeInteger(generatedAt) &&
    generatedAt <= now &&
    Number.isSafeInteger(validUntil) &&
    validUntil > now &&
    validUntil - generatedAt <= 60_000 &&
    Array.isArray(frames) &&
    frames.length > 0 &&
    frames.every(
      (frame, index) =>
        isBoardFrame(frame) &&
        frame.at < validUntil &&
        (index === 0 ? frame.at === generatedAt : frame.at > frames[index - 1].at),
    )
  );
}

export function useDepartureBoardPreview(routeId: string, now: Date) {
  const [plan, setPlan] = useState<BoardPlan>();
  const [transport, setTransport] = useState<Transport>('connecting');
  const [boundaryAt, setBoundaryAt] = useState(0);

  useEffect(() => {
    const query = new URLSearchParams({ station: 'daimon', route: routeId });
    const url = `${import.meta.env.BASE_URL}api/departure-board?${query}`;
    const lifetime = new AbortController();
    let source: EventSource | undefined;
    let lastStreamAt = 0;
    let streamActive = false;
    let requesting = false;
    let waitingSince = Date.now();
    let latestGeneratedAt = -Infinity;

    function accept(value: unknown) {
      if (!isBoardPlan(value, Date.now()) || value.generatedAt < latestGeneratedAt) return false;
      if (value.generatedAt > latestGeneratedAt) {
        latestGeneratedAt = value.generatedAt;
        setPlan(value);
      }
      return true;
    }

    async function refresh() {
      if (requesting || streamActive) return;
      requesting = true;
      try {
        const response = await fetch(url, {
          cache: 'no-store',
          signal: AbortSignal.any([lifetime.signal, AbortSignal.timeout(STREAM_TIMEOUT_MS)]),
        });
        if (!response.ok) throw Error('Departure board unavailable');
        const value: unknown = await response.json();
        if (!lifetime.signal.aborted) {
          if (!accept(value)) throw Error('Invalid or stale departure board');
          if (!streamActive) setTransport('http');
        }
      } catch {
        if (!lifetime.signal.aborted && !streamActive && Date.now() - waitingSince >= REFRESH_MS)
          setTransport('unavailable');
      } finally {
        requesting = false;
      }
    }

    function stopStream() {
      source?.close();
      source = undefined;
      streamActive = false;
    }

    function fallBackToHttp() {
      if (streamActive) {
        waitingSince = Date.now();
        setTransport('connecting');
      }
      stopStream();
      void refresh();
    }

    function connect() {
      if (source || typeof EventSource === 'undefined') return;
      const connection = new EventSource(url);
      source = connection;
      lastStreamAt = Date.now();
      connection.addEventListener('board', (event) => {
        if (source !== connection) return;
        try {
          if (!accept(JSON.parse(event.data))) return;
          lastStreamAt = Date.now();
          streamActive = true;
          setTransport('sse');
        } catch {
          fallBackToHttp();
        }
      });
      connection.onerror = () => {
        if (source === connection) fallBackToHttp();
      };
    }

    function update() {
      if (source && Date.now() - lastStreamAt >= STREAM_TIMEOUT_MS) fallBackToHttp();
      else void refresh();
      connect();
    }

    update();
    const interval = window.setInterval(update, REFRESH_MS);
    return () => {
      lifetime.abort();
      stopStream();
      window.clearInterval(interval);
    };
  }, [routeId]);

  const time = Math.max(now.getTime(), Date.now(), boundaryAt);
  const current = plan && time >= plan.generatedAt && time < plan.validUntil ? plan : undefined;
  const nextIndex = current?.frames.findIndex(({ at }) => at > time) ?? -1;
  const nextAt = nextIndex > 0 ? current?.frames[nextIndex].at : current?.validUntil;
  useEffect(() => {
    if (nextAt === undefined) return;
    const timer = window.setTimeout(() => setBoundaryAt(nextAt), Math.max(0, nextAt - Date.now()));
    return () => window.clearTimeout(timer);
  }, [nextAt]);

  const frame = current?.frames.at(nextIndex > 0 ? nextIndex - 1 : -1);
  return {
    display: frame ? frame.display : undefined,
    pending: !plan && transport === 'connecting',
    transport,
  };
}
