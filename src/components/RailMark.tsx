import type { CSSProperties } from 'react';
import { TrainIcon } from '@phosphor-icons/react/dist/csr/Train';

export function RailMark({ color, symbol }: { color: string; symbol: string }) {
  return (
    <span
      className="rail-mark"
      style={
        {
          '--line-color': color,
          ...(symbol.length > 2 ? { fontSize: '8px' } : {}),
        } as CSSProperties
      }
    >
      {symbol || <TrainIcon size="70%" aria-hidden="true" />}
    </span>
  );
}
