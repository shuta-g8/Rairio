import { useEffect, useRef, useState } from 'react';
import type { Departure, Route } from '../types';
import { departureDisplayDiagnosticsEnabled } from '../lib/departure-policy';
import { departureIdentity, type DeparturePresentation } from '../lib/time';

export type DepartureDisplaySource = 'server' | 'local';

export function useDepartureDisplayDiagnostics(
  source: DepartureDisplaySource,
  route: Route,
  first: Departure | undefined,
  presentation: DeparturePresentation['kind'] | 'normal' | undefined,
) {
  const [enabled] = useState(departureDisplayDiagnosticsEnabled);
  const last = useRef('');
  useEffect(() => {
    if (!enabled) return;
    const detail = {
      source,
      route: route.id,
      station: route.sourceStationId,
      first: first && departureIdentity(first),
      presentation,
    };
    const serialized = JSON.stringify(detail);
    if (serialized === last.current) return;
    last.current = serialized;
    window.dispatchEvent(
      new CustomEvent('rairio:departure-display-diagnostic', {
        detail: { ...detail, at: Date.now() },
      }),
    );
  }, [enabled, first, presentation, route.id, route.sourceStationId, source]);
}
