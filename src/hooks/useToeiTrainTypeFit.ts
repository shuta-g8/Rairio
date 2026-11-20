import { useLayoutEffect, useRef } from 'react';
import { TOEI_TEXT_WIDTHS } from '../lib/toei-text-width';
import {
  applyToeiTextWidth,
  observeToeiTextLayout,
  readToeiTextLines,
  resetToeiText,
  toeiTextWidths,
} from '../lib/toei-text-measure';

/** Share horizontal fitting between name and translation. */
function fitTrainTypeText(element: HTMLElement, available: number, multiline = false) {
  resetToeiText(element);
  if (available <= 0) {
    element.style.width = '0px';
    return;
  }
  const lines = readToeiTextLines(element, multiline);
  const widths = toeiTextWidths(lines);
  const width = TOEI_TEXT_WIDTHS.find((width) => widths[width] <= available) || 60;
  const measured = applyToeiTextWidth(element, lines, width, multiline);
  const scale = Number(element.style.getPropertyValue('--toei-text-scale')) || 1;
  // Small fallback kana can occupy more layout pixels than canvas predicts.
  let fitted = measured;
  for (const line of element.querySelectorAll<HTMLElement>(':scope > .toei-fit-text')) {
    line.style.width = 'max-content';
    fitted = Math.max(fitted, line.offsetWidth * scale);
    line.style.removeProperty('width');
  }
  // Preserve height when even the narrowest width exceeds the available column.
  if (fitted > available) {
    const fittedScale = (scale * available) / fitted;
    element.style.setProperty('--toei-text-scale', String(fittedScale));
    element.style.width = `${multiline ? available / fittedScale : available}px`;
  }
}

/** Fit text beside the full-size icon without shrinking either one's height. */
export function useToeiTrainTypeFit(
  type: string,
  language: string,
  railwayId: string | undefined,
  secondary: boolean,
) {
  const ref = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    const root = ref.current!;
    const heading = root.querySelector<HTMLElement>('.toei-type-heading')!;
    const name = root.querySelector<HTMLElement>('.toei-type-name')!;
    const icon = root.querySelector<SVGSVGElement>('.toei-type-airplane');
    const translation = root.querySelector<HTMLElement>('.toei-type-translation');
    const fit = () => {
      // CSS layout widths remain stable while the departure row rotates.
      const iconWidth = icon ? parseFloat(getComputedStyle(icon).width) || 0 : 0;
      const gap = icon ? parseFloat(getComputedStyle(heading).columnGap) || 0 : 0;
      fitTrainTypeText(name, Math.max(0, heading.clientWidth - iconWidth - gap));
      if (translation) {
        fitTrainTypeText(translation, translation.parentElement!.clientWidth, true);
      }
    };
    return observeToeiTextLayout(root, fit);
  }, [type, language, railwayId, secondary]);
  return ref;
}
