import { useEffect, useRef, useState } from 'react';
import type { Route } from '../types';
import type { TrainPositionsSnapshot } from '../../shared/train-positions';
import type { StationDepartureBoardDisplay } from '../../shared/departure-board';
import { resolveLiveDepartures, type DepartureBoardDisplay } from '../lib/live-departures';
import {
  APPROACH_END_LEAD_MS,
  rememberServerDepartures,
  resolveHybridDepartures,
} from '../lib/hybrid-departures';
import {
  departureDiagnosticsEnabled,
  earlyApproachEndEnabled,
  readDeparturePolicy,
} from '../lib/departure-policy';
import { departureIdentity } from '../lib/time';

export function useLiveDepartures(
  route: Route,
  positions: TrainPositionsSnapshot | null | undefined,
  now: Date,
  useEstimates = true,
  serverDisplay?: StationDepartureBoardDisplay,
) {
  const [policy] = useState(readDeparturePolicy);
  const [diagnostics] = useState(departureDiagnosticsEnabled);
  const [earlyApproachEnd] = useState(earlyApproachEndEnabled);
  const approachEndLeadMs = earlyApproachEnd ? APPROACH_END_LEAD_MS : 0;
  type Frame = {
    route: Route;
    at: number;
    positions: typeof positions;
    serverDisplay: typeof serverDisplay;
    hybrid?: ReturnType<typeof resolveHybridDepartures>;
    baselineHybrid?: ReturnType<typeof resolveHybridDepartures>;
    legacy?: ReturnType<typeof resolveLiveDepartures>;
  };
  const calculate = (previous?: Frame): Frame => ({
    route,
    at: now.getTime(),
    positions,
    serverDisplay,
    hybrid:
      policy === 'hybrid' || diagnostics
        ? rememberServerDepartures(
            resolveHybridDepartures(
              route,
              now,
              positions,
              previous?.hybrid?.session,
              useEstimates,
              approachEndLeadMs,
            ),
            serverDisplay,
            now.getTime(),
          )
        : undefined,
    baselineHybrid:
      diagnostics && earlyApproachEnd
        ? resolveHybridDepartures(
            route,
            now,
            positions,
            previous?.baselineHybrid?.session,
            useEstimates,
            0,
          )
        : undefined,
    legacy:
      policy === 'legacy' || diagnostics
        ? resolveLiveDepartures(route, now, positions, previous?.legacy?.session)
        : undefined,
  });
  const [stored, setStored] = useState(() => calculate());
  const changed =
    stored.route !== route ||
    stored.at !== now.getTime() ||
    stored.positions !== positions ||
    stored.serverDisplay !== serverDisplay;
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
    const baseline = frame.baselineHybrid ?? frame.hybrid;
    const detail = {
      route: route.id,
      station: route.sourceStationId,
      policy,
      approachEndLeadMs,
      hybrid: frame.hybrid?.diagnostic,
      turnover: frame.hybrid?.session.lastTurnover,
      hybridDisplay: summary(frame.hybrid),
      baselineHybrid: baseline?.diagnostic,
      baselineTurnover: baseline?.session.lastTurnover,
      baselineDisplay: summary(baseline),
      legacy: summary(frame.legacy),
    };
    const serialized = JSON.stringify(detail);
    if (serialized === lastDiagnostic.current) return;
    lastDiagnostic.current = serialized;
    window.dispatchEvent(
      new CustomEvent('rairio:departure-diagnostic', { detail: { ...detail, at: now.getTime() } }),
    );
  }, [diagnostics, approachEndLeadMs, frame, policy, route.id, route.sourceStationId, now]);
  return (policy === 'hybrid' ? frame.hybrid : frame.legacy)!;
}
