import type { ReactNode } from 'react';
import { JourneyRailTrack } from './JourneyRailTrack';

export function JourneyWalkRow({
  children,
  contentColSpan = 1,
  fare,
}: {
  children: ReactNode;
  contentColSpan?: number;
  fare?: ReactNode;
}) {
  return (
    <tr className="journey-transfer-row">
      <JourneyRailTrack color="#9aa0a6" />
      <td colSpan={contentColSpan}>
        <small>{children}</small>
      </td>
      {fare}
    </tr>
  );
}
