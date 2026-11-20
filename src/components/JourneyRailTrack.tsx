import type { CSSProperties } from 'react';

export function JourneyRailTrack({ color }: { color?: string }) {
  return (
    <td
      className="journey-time-track"
      style={{ '--rail-color': color || 'var(--app-border)' } as CSSProperties}
    >
      <span aria-hidden="true" />
    </td>
  );
}
