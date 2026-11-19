import { RailMark } from './RailMark';

export function StationResultLines({
  lines,
}: {
  lines: { id: string; name: string; symbol?: { color: string; code: string } }[];
}) {
  return (
    <span className="station-result-lines">
      {lines.map((line) => (
        <span className="station-result-line" key={line.id}>
          {line.symbol && (
            <span aria-hidden="true">
              <RailMark color={line.symbol.color} symbol={line.symbol.code} />
            </span>
          )}
          <span>{line.name}</span>
        </span>
      ))}
    </span>
  );
}
