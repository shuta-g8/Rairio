import { useLayoutEffect, useRef } from 'react';
import {
  selectToeiTextWidths,
  TOEI_TEXT_WIDTHS,
  type ToeiWidthMeasurements,
} from '../lib/toei-text-width';
import {
  applyToeiTextWidth,
  observeToeiTextLayout,
  readToeiTextLines,
  resetToeiText,
  toeiTextWidths,
} from '../lib/toei-text-measure';

/** Measure Japanese and translations separately; only change both as a last resort. */
export function useToeiTextFit(destination: string, language: string) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const root = ref.current;
    if (!root) return;
    function fit() {
      if (!root?.isConnected) return;
      const heading = root.querySelector<HTMLElement>('.toei-destination-heading');
      const translations = root.querySelector<HTMLElement>('.toei-destination-translations');
      const translation = translations?.firstElementChild as HTMLElement | null;
      const names = [...root.querySelectorAll<HTMLElement>('.destination-name')];
      if (!heading || !translations || !translation) return;
      names.forEach(resetToeiText);
      resetToeiText(translation);
      heading.style.removeProperty('width');
      translations.style.removeProperty('flex-basis');
      const gap = (node: HTMLElement) => parseFloat(getComputedStyle(node).columnGap) || 0;
      const boxWidth = (node: Element) => {
        const style = getComputedStyle(node);
        return (
          // Layout width stays measurable while the departure row rotates edge-on.
          (node as HTMLElement).offsetWidth +
          (parseFloat(style.marginLeft) || 0) +
          (parseFloat(style.marginRight) || 0)
        );
      };
      const nameLines = names.map((name) =>
        name.dataset.lines === '2'
          ? readToeiTextLines(name.querySelector<HTMLElement>('.toei-fit-text')!, true)
          : readToeiTextLines(name),
      );
      const nameWidths = nameLines.map((lines) => toeiTextWidths(lines));
      let fixed = gap(heading) * Math.max(0, heading.children.length - 1);
      for (const station of heading.children) {
        if (!station.classList.contains('toei-direction-station')) fixed += boxWidth(station);
        else {
          fixed += gap(station as HTMLElement) * Math.max(0, station.children.length - 1);
          for (const part of station.children)
            if (!part.classList.contains('destination-name')) fixed += boxWidth(part);
        }
      }
      const nameTotals = Object.fromEntries(
        TOEI_TEXT_WIDTHS.map((width) => [
          width,
          fixed + nameWidths.reduce((sum, widths) => sum + widths[width], 0),
        ]),
      ) as ToeiWidthMeasurements;
      const lines = readToeiTextLines(translation, true);
      const translationWidths = toeiTextWidths(lines);
      const extra = root.querySelector('.platform');
      const available =
        root.clientWidth -
        gap(root) * (root.children.length - 1) -
        (extra ? boxWidth(extra) : 0) -
        1;
      const choice = selectToeiTextWidths(nameTotals, translationWidths, available);
      names.forEach((name, index) => {
        const width = applyToeiTextWidth(name, nameLines[index], choice.names);
        if (name.dataset.lines !== '2') return;
        // WebKit can lay out fallback glyphs wider than its canvas measurement.
        const text = name.querySelector<HTMLElement>('.toei-fit-text')!;
        const scale = Number(name.style.getPropertyValue('--toei-text-scale'));
        if (text.offsetWidth * scale > width)
          name.style.setProperty('--toei-text-scale', String(width / text.offsetWidth));
      });
      heading.style.width = `${nameTotals[choice.names]}px`;
      const translationWidth = applyToeiTextWidth(translation, lines, choice.translations, true);
      translations.style.flexBasis = `${translationWidth}px`;
    }
    // A late font can resize the text without resizing its allocated column.
    return observeToeiTextLayout(
      root,
      fit,
      root.querySelectorAll<HTMLElement>('.destination-name[data-lines="2"] .toei-fit-text'),
    );
  }, [destination, language]);
  return ref;
}
