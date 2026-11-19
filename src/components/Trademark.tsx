import { TRADEMARK_ART } from './trademark-data';

export function Trademark({ x, y, height }: { x: number; y: number; height: number }) {
  return (
    <g
      data-logo-trademark=""
      transform={`translate(${x} ${y}) scale(${height / TRADEMARK_ART.height})`}
      fill="currentColor"
      aria-hidden="true"
    >
      <path d={TRADEMARK_ART.path} />
    </g>
  );
}
