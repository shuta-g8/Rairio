import type { CSSProperties } from 'react';
import { findStation } from '../lib/stations';
import { RAILWAY_SYMBOLS } from '../lib/railway-symbols';
import { JOURNEY_LINES, type JourneyLine } from '../../shared/journey';

export interface JourneyStopNumber {
  code: string;
  line: string;
  color?: string;
}

export function JourneyStationNumbers({
  stationId,
  lines,
  additional = [],
}: {
  stationId?: string;
  lines?: JourneyLine[];
  additional?: readonly JourneyStopNumber[];
}) {
  const memberships = stationId ? (findStation(stationId)?.memberships ?? []) : [];
  const localCodes = memberships
    .filter((m) => !lines?.length || lines.includes(m.railwayId as JourneyLine))
    .map((m) => ({
      code: m.code,
      line: JOURNEY_LINES[m.railwayId as JourneyLine]?.name || m.railwayId,
      color: RAILWAY_SYMBOLS[`Toei.${m.railwayId}`]?.color,
    }));
  const numbers = new Map<string, JourneyStopNumber>();
  for (const number of [...localCodes, ...additional])
    if (!numbers.has(number.code)) numbers.set(number.code, number);
  return [...numbers.values()].map(({ code, line, color }) => {
    const [prefix, number] = code.split('-');
    return (
      <span
        key={code}
        className="journey-station-number"
        style={{ '--line-color': color } as CSSProperties}
        aria-label={`${line} ${code}`}
        title={`${line} ${code}`}
      >
        <span>{prefix}</span>
        <span>{number}</span>
      </span>
    );
  });
}
