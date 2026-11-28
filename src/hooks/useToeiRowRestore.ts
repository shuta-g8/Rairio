import { useLayoutEffect, useRef } from 'react';
import { serviceDate } from '../lib/time';
import type { Route } from '../types';
import { toeiBoardRowIdentity, type ToeiBoardRow } from './useToeiDepartureFlip';

const REMEMBER_ROWS_MS = 120_000;
const MAX_REMEMBERED_BOARDS = 24;

type RememberedRow = { identity: string; until: number };
type RememberedRows = readonly [RememberedRow | undefined, RememberedRow | undefined];
type ShownRows = readonly [string | undefined, string | undefined];

const rememberedBoards = new Map<string, RememberedRows>();

function specialIdentity(row: ToeiBoardRow | undefined) {
  return row && 'kind' in row ? toeiBoardRowIdentity(row) : undefined;
}

function unexpired(row: RememberedRow | undefined, at: number) {
  return row && row.until > at ? row : undefined;
}

function pendingRowAfterDisplay(
  row: RememberedRow | undefined,
  previous: string | undefined,
  shown: string | undefined,
  other: string | undefined,
) {
  // A row still visible in the first resume render can disappear while the feed refreshes.
  if (row && other !== row.identity && (!shown || (shown === row.identity && previous === shown)))
    return row;
}

/** Keep just enough presentation history to settle a reverified row after switching tabs. */
export function useToeiRowRestore(
  route: Route,
  now: Date,
  first: ToeiBoardRow | undefined,
  next: ToeiBoardRow | undefined,
) {
  const scope = JSON.stringify([route.sourceStationId, route.id, serviceDate(now)]);
  const shown = useRef<{ scope: string; rows: ShownRows }>(undefined);
  const pending = useRef<{ scope: string; rows: RememberedRows }>(undefined);

  useLayoutEffect(() => {
    const remembered = rememberedBoards.get(scope);
    rememberedBoards.delete(scope);
    pending.current = remembered ? { scope, rows: remembered } : undefined;

    let visibility = document.visibilityState;
    let hidden: RememberedRows | undefined;
    const snapshot = (): RememberedRows => {
      const rows = shown.current?.scope === scope ? shown.current.rows : undefined;
      const previous = pending.current?.scope === scope ? pending.current.rows : undefined;
      const at = performance.now();
      function remember(index: 0 | 1) {
        const identity = rows?.[index];
        return identity
          ? { identity, until: at + REMEMBER_ROWS_MS }
          : unexpired(previous?.[index], at);
      }
      return [remember(0), remember(1)];
    };
    const visibilityChanged = () => {
      if (visibility === document.visibilityState) return;
      visibility = document.visibilityState;
      if (visibility === 'hidden') {
        hidden = snapshot();
      } else if (hidden) {
        pending.current = { scope, rows: hidden };
        hidden = undefined;
      }
    };
    document.addEventListener('visibilitychange', visibilityChanged);
    return () => {
      document.removeEventListener('visibilitychange', visibilityChanged);
      const rows = hidden ?? snapshot();
      const at = performance.now();
      if (!rows.some((row) => unexpired(row, at))) return;
      if (rememberedBoards.size >= MAX_REMEMBERED_BOARDS) {
        const oldest = rememberedBoards.keys().next().value;
        if (oldest !== undefined) rememberedBoards.delete(oldest);
      }
      rememberedBoards.set(scope, rows);
    };
  }, [scope]);

  const at = performance.now();
  const lastShown = shown.current?.scope === scope ? shown.current.rows : undefined;
  const remembered = pending.current?.scope === scope ? pending.current.rows : undefined;
  const firstRemembered = unexpired(remembered?.[0], at);
  const nextRemembered = unexpired(remembered?.[1], at);
  const firstId = specialIdentity(first);
  const nextId = specialIdentity(next);
  const restoreFirst =
    !!firstId && firstId !== lastShown?.[0] && firstId === firstRemembered?.identity;
  const restoreNext = !!nextId && nextId !== lastShown?.[1] && nextId === nextRemembered?.identity;

  return {
    // Settle the ordinary companion row with the restored row, so it does not flip separately.
    first: restoreFirst || (restoreNext && !firstId),
    next: restoreNext || (restoreFirst && !nextId),
    recordShownRows(first: ToeiBoardRow | undefined, next: ToeiBoardRow | undefined) {
      if (document.visibilityState !== 'visible') return;
      const firstId = specialIdentity(first);
      const nextId = specialIdentity(next);
      const previous = shown.current?.scope === scope ? shown.current.rows : undefined;
      shown.current = { scope, rows: [firstId, nextId] };
      if (pending.current?.scope === scope) {
        const [firstPending, nextPending] = pending.current.rows;
        const at = performance.now();
        pending.current.rows = [
          pendingRowAfterDisplay(unexpired(firstPending, at), previous?.[0], firstId, nextId),
          pendingRowAfterDisplay(unexpired(nextPending, at), previous?.[1], nextId, firstId),
        ];
      }
    },
  };
}
