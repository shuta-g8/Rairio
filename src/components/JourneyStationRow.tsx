import type { ReactNode } from 'react';

export function JourneyStationRow({
  name,
  times,
  numbers,
  transfer,
  external = false,
  contentColSpan = 1,
}: {
  name: string;
  times?: ReactNode;
  numbers?: ReactNode;
  transfer?: string;
  external?: boolean;
  contentColSpan?: number;
}) {
  return (
    <tr className={`journey-station-row${external ? ' journey-external-station-row' : ''}`}>
      <td className="journey-station-times">{times ?? <span aria-label="時刻未案内">—</span>}</td>
      <td colSpan={contentColSpan}>
        <div className="journey-station-heading">
          {numbers}
          <strong className="journey-table-station">{name}</strong>
        </div>
        {transfer && <small className="journey-transfer-note">{transfer}</small>}
      </td>
    </tr>
  );
}
