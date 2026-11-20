import { RAILWAY_SYMBOLS } from '../lib/railway-symbols';
import { networkLineSymbol } from '../lib/kanto-network';
import { RailMark } from './RailMark';

export function journeyLineSymbol(id: string) {
  return id.startsWith('network:') ? networkLineSymbol(id.slice(8)) : RAILWAY_SYMBOLS[id];
}

export function JourneyLineMark({ id, color }: { id: string; color?: string }) {
  const symbol = journeyLineSymbol(id);
  return (
    <span aria-hidden="true">
      <RailMark color={symbol?.color ?? color ?? '#687582'} symbol={symbol?.code ?? ''} />
    </span>
  );
}

export function JourneyRailLabel({
  id,
  name,
  color,
}: {
  id?: string;
  name: string;
  color?: string;
}) {
  return (
    <div className="journey-rail-label">
      {id && <JourneyLineMark id={id} color={color} />}
      <b>{name}</b>
    </div>
  );
}

export function JourneySummaryHeading({
  lines,
  label,
}: {
  lines: { id: string; name: string; external: boolean; color?: string }[];
  label: string;
}) {
  return (
    <span className="journey-summary-heading">
      <span className="journey-summary-lines" role="group" aria-label="利用する路線">
        {[...lines.filter((line) => !line.external), ...lines.filter((line) => line.external)].map(
          (line) => (
            <span
              key={line.id === 'unknown' ? line.name : line.id}
              title={line.name}
              role="img"
              aria-label={line.name}
            >
              <JourneyLineMark id={line.id} color={line.color} />
            </span>
          ),
        )}
      </span>
      <span className="journey-tag">{label}</span>
    </span>
  );
}
