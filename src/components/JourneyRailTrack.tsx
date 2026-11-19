import type { CSSProperties, ReactNode } from 'react';

export function JourneyRailTrack({ color, children }: { color?: string; children?: ReactNode }) {
  return (
    <td
      className="journey-time-track"
      style={{ '--rail-color': color || 'var(--app-border)' } as CSSProperties}
    >
      <span aria-hidden="true" />
      {children}
    </td>
  );
}
