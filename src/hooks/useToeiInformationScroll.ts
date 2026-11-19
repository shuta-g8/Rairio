import { useLayoutEffect, useRef } from 'react';

const BOARD_WIDTHS_PER_SECOND = 0.1;
const REPEAT_PAUSE_SECONDS = 3;
let informationEpoch: number | undefined;

/** Scroll one complete sequence offscreen, then leave the row empty before repeating. */
export function useToeiInformationScroll(contentKey: string, continuous = false) {
  const viewport = useRef<HTMLDivElement>(null);
  const sequence = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const root = viewport.current!;
    const text = sequence.current!;
    informationEpoch ??= Date.now();
    const elapsed = continuous ? (Date.now() - informationEpoch) / 1000 : 0;
    const measure = () => {
      const boardWidth = root.closest('.toei-board')!.getBoundingClientRect().width;
      const viewportWidth = root.clientWidth;
      const distance = viewportWidth + text.getBoundingClientRect().width;
      const scrollSeconds = distance / (boardWidth * BOARD_WIDTHS_PER_SECOND);
      const duration = scrollSeconds + REPEAT_PAUSE_SECONDS;
      root.style.setProperty('--toei-information-start', `${viewportWidth}px`);
      root.style.setProperty('--toei-information-duration', `${duration}s`);
      root.style.setProperty('--toei-information-delay', `${-(elapsed % duration)}s`);
      root.style.setProperty(
        '--toei-information-scroll-end',
        `${(scrollSeconds / duration) * 100}%`,
      );
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(root);
    observer.observe(text);
    return () => observer.disconnect();
  }, [contentKey, continuous]);
  return { viewport, sequence };
}
