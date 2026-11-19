import { useLayoutEffect, useRef } from 'react';
import { TOEI_TEXT_WIDTHS } from '../lib/toei-text-width';
import {
  applyToeiTextWidth,
  observeToeiTextLayout,
  readToeiTextLines,
  resetToeiText,
  toeiTextWidths,
} from '../lib/toei-text-measure';

/** Share face selection and the final horizontal fit between name and translation. */
function fitTrainTypeText(
  element: HTMLElement,
  available: number,
  bold: boolean,
  language = 'ja',
  multiline = false,
) {
  resetToeiText(element);
  if (available <= 0) {
    element.style.width = '0px';
    return;
  }
  const lines = readToeiTextLines(element, multiline);
  const widths = toeiTextWidths(lines, bold, language);
  const width = TOEI_TEXT_WIDTHS.find((width) => widths[width] <= available) || 60;
  const fitted = applyToeiTextWidth(element, lines, width, bold, language, multiline);
  // Preserve height when even the narrowest face exceeds the available column.
  if (fitted > available) {
    const scale =
      ((Number(element.style.getPropertyValue('--toei-text-scale')) || 1) * available) / fitted;
    element.style.setProperty('--toei-text-scale', String(scale));
    element.style.width = `${multiline ? available / scale : available}px`;
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
      fitTrainTypeText(name, Math.max(0, heading.clientWidth - iconWidth - gap), true);
      if (translation) {
        fitTrainTypeText(
          translation,
          translation.parentElement!.clientWidth,
          false,
          language,
          true,
        );
      }
    };
    return observeToeiTextLayout(root, fit);
  }, [type, language, railwayId, secondary]);
  return ref;
}
