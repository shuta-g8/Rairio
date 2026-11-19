import type { CSSProperties } from 'react';
import { findStation } from '../lib/stations';
import { RAILWAY_SYMBOLS } from '../lib/railway-symbols';
import { JOURNEY_LINES, type JourneyLine } from '../../shared/journey';

export function JourneyStationNumbers({
  stationId,
  lines,
}: {
  stationId: string;
  lines?: JourneyLine[];
}) {
  const memberships = findStation(stationId)?.memberships || [];
  return memberships
    .filter((m) => !lines?.length || lines.includes(m.railwayId as JourneyLine))
    .map((m) => (
      <span
        key={m.railwayId}
        className="journey-station-number"
        style={{ '--line-color': RAILWAY_SYMBOLS[`Toei.${m.railwayId}`]?.color } as CSSProperties}
        aria-label={`${JOURNEY_LINES[m.railwayId as JourneyLine]?.name || m.railwayId} ${m.code}`}
        title={`${JOURNEY_LINES[m.railwayId as JourneyLine]?.name || m.railwayId} ${m.code}`}
      >
        <span>{m.code.split('-')[0]}</span>
        <span>{m.code.split('-')[1]}</span>
      </span>
    ));
}
