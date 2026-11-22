import { memo, useId } from 'react';
import { LOGO_BOUNDS, LOGO_PARTS } from './LogoAnimation/logo-data';
import { EDITION } from '../lib/brand';
import { Trademark } from './Trademark';
import { logoLayout } from './logo-layout';
import { logoSymbolMarkup } from './logo-symbol';

/** Approved symbol and original wordmark, with their proportions preserved. */
export const Logo = memo(function Logo({
  width = 104,
  decorative = false,
  edition = false,
}: {
  width?: number;
  decorative?: boolean;
  edition?: boolean;
}) {
  const { height, symbolWidth, gap, trademark, wordWidth } = logoLayout(edition);
  const wordX = symbolWidth + gap;
  const totalWidth = wordX + wordWidth;
  const displayWidth = (width * totalWidth) / LOGO_BOUNDS.width;
  const id = `static-logo-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  return (
    <svg
      viewBox={`0 0 ${totalWidth} ${height}`}
      width={displayWidth}
      height={(displayWidth * height) / totalWidth}
      style={{ display: 'block', maxWidth: '100%', height: 'auto' }}
      fill="currentColor"
      role={decorative ? undefined : 'img'}
      aria-label={decorative ? undefined : 'Rairio'}
      aria-hidden={decorative ? true : undefined}
      focusable="false"
      data-static-logo=""
    >
      <svg
        x="0"
        y="0"
        width={symbolWidth}
        height={height}
        viewBox="6 10 467 196"
        fill="none"
        aria-hidden="true"
        dangerouslySetInnerHTML={{ __html: logoSymbolMarkup(id) }}
      />
      <g transform={`translate(${wordX} 0)`}>
        {LOGO_PARTS.map((part) => (
          <path key={part.id} d={part.d} />
        ))}
      </g>
      <Trademark
        x={wordX + LOGO_BOUNDS.width + trademark.gap}
        y={trademark.y}
        height={trademark.height}
      />
      {edition && (
        <text
          x={wordX}
          y={height - LOGO_BOUNDS.height * 0.04}
          fontSize={LOGO_BOUNDS.height * 0.28}
          fontFamily="inherit"
          fontWeight="400"
          letterSpacing="0.02em"
          aria-hidden="true"
        >
          {EDITION}
        </text>
      )}
    </svg>
  );
});
