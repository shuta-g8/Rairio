import { useEffect, useRef, useState } from 'react';
import type { Route } from '../types';
import type { TrainPositionsSnapshot } from '../../shared/train-positions';
import { resolveLiveDepartures, type DepartureBoardDisplay } from '../lib/live-departures';
import { resolveHybridDepartures } from '../lib/hybrid-departures';
import { readDeparturePolicy, departureDiagnosticsEnabled } from '../lib/departure-policy';
import { departureIdentity } from '../lib/time';

export function useLiveDepartures(
  route: Route,
  positions: TrainPositionsSnapshot | null | undefined,
  now: Date,
  useEstimates = true,
) {
  const [policy] = useState(readDeparturePolicy);
  const [diagnostics] = useState(departureDiagnosticsEnabled);
  type Frame = {
    route: Route;
    at: number;
    positions: typeof positions;
    hybrid?: ReturnType<typeof resolveHybridDepartures>;
    legacy?: ReturnType<typeof resolveLiveDepartures>;
  };
  const calculate = (previous?: Frame): Frame => ({
    route,
    at: now.getTime(),
    positions,
    hybrid:
      policy === 'hybrid' || diagnostics
        ? resolveHybridDepartures(route, now, positions, previous?.hybrid?.session, useEstimates)
        : undefined,
    legacy:
      policy === 'legacy' || diagnostics
        ? resolveLiveDepartures(route, now, positions, previous?.legacy?.session)
        : undefined,
  });
  const [stored, setStored] = useState(() => calculate());
  const changed =
    stored.route !== route || stored.at !== now.getTime() || stored.positions !== positions;
  const frame = changed ? calculate(stored) : stored;
  if (changed) setStored(frame);
  const lastDiagnostic = useRef('');
  useEffect(() => {
    if (!diagnostics) return;
    const summary = (display: DepartureBoardDisplay | undefined) =>
      display && {
        board: display.board.kind,
        first:
          display.board.kind === 'active'
            ? departureIdentity(display.board.departures[0])
            : undefined,
        presentation: display.presentation?.kind,
      };
    const detail = {
      route: route.id,
      policy,
      hybrid: frame.hybrid?.diagnostic,
      turnover: frame.hybrid?.session.lastTurnover,
      hybridDisplay: summary(frame.hybrid),
      legacy: summary(frame.legacy),
    };
    const serialized = JSON.stringify(detail);
    if (serialized === lastDiagnostic.current) return;
    lastDiagnostic.current = serialized;
    window.dispatchEvent(
      new CustomEvent('rairio:departure-diagnostic', { detail: { ...detail, at: now.getTime() } }),
    );
  }, [diagnostics, frame, policy, route.id, now]);
  return (policy === 'hybrid' ? frame.hybrid : frame.legacy)!;
}
