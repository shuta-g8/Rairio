import { useLayoutEffect, useRef } from 'react';
import { selectToeiTextWidth } from '../lib/toei-text-width';
import {
  applyToeiTextWidth,
  observeToeiTextLayout,
  readToeiTextLines,
  resetToeiText,
  toeiTextWidths,
} from '../lib/toei-text-measure';

function horizontalGap(element: HTMLElement) {
  return parseFloat(getComputedStyle(element).columnGap) || 0;
}

function fixedHeadingWidth(heading: HTMLElement) {
  function fixedWidth(parent: HTMLElement): number {
    const children = ([...parent.children] as HTMLElement[]).filter(
      (child) => !heading.dataset.terminal || !child.classList.contains('toei-station-number'),
    );
    return children.reduce(
      (width, child) => {
        if (child.classList.contains('destination-name')) return width;
        if (child.classList.contains('toei-direction-station')) return width + fixedWidth(child);
        const { marginLeft, marginRight } = getComputedStyle(child);
        return (
          width + child.offsetWidth + (parseFloat(marginLeft) || 0) + (parseFloat(marginRight) || 0)
        );
      },
      horizontalGap(parent) * Math.max(0, children.length - 1),
    );
  }
  const { paddingLeft, paddingRight } = getComputedStyle(heading);
  return fixedWidth(heading) + parseFloat(paddingLeft) + parseFloat(paddingRight);
}

/** Fit Japanese and translated names within their own shared row columns. */
export function useToeiTextFit() {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const root = ref.current!;
    const heading = root.querySelector<HTMLElement>('.toei-destination-heading')!;
    const translations = root.querySelector<HTMLElement>('.toei-destination-translations');
    const translation = translations?.firstElementChild as HTMLElement | null;
    const names = [...heading.querySelectorAll<HTMLElement>('.destination-name')];
    const texts = names.map((name) => name.querySelector<HTMLElement>('.toei-fit-text')!);
    const nextRow = root.closest('.departure-row.second');
    function fit() {
      if (!root.isConnected || !root.clientWidth) return;
      for (const name of names) name.style.removeProperty('--toei-name-spacing');
      const available = Math.max(0, heading.clientWidth - fixedHeadingWidth(heading) - 1);
      const widths = texts.map((text) => parseFloat(getComputedStyle(text).width));
      const total = widths.reduce((width, measured) => width + measured, 0);
      const scale = Math.min(1, available / Math.max(1, total));
      const kanjiCount = names.length === 1 ? Number(names[0].dataset.kanjiCount) : 0;

      names.forEach((name, index) => {
        const text = texts[index];
        let fittedWidth = widths[index] * scale;
        if (nextRow && kanjiCount && scale === 1) {
          const fontSize = parseFloat(getComputedStyle(text).fontSize);
          const spacing = Math.min(fontSize * 0.35, (available - fittedWidth) / kanjiCount);
          name.style.setProperty('--toei-name-spacing', `${spacing}px`);
          fittedWidth = parseFloat(getComputedStyle(text).width);
        }
        name.style.setProperty('--toei-text-scale', String(scale));
        name.style.width = `${fittedWidth}px`;
      });

      if (translations && translation) {
        resetToeiText(translation);
        const lines = readToeiTextLines(translation, true);
        const available = translations.clientWidth;
        const width = selectToeiTextWidth(toeiTextWidths(lines), available);
        translation.style.width = 'max-content';
        const naturalWidth = translation.offsetWidth;
        const measured = applyToeiTextWidth(translation, lines, width, true);
        const unscaled = Math.max(naturalWidth, (measured * 100) / width);
        const scale = Math.min(width / 100, available / Math.max(1, unscaled));
        translation.style.setProperty('--toei-text-scale', String(scale));
        translation.style.width = `${unscaled}px`;
      }
    }
    fit();
    // A change in the note or fonts can resize the text inside an unchanged row.
    return observeToeiTextLayout(root, fit, translations ? [...texts, translations] : texts);
  });
  return ref;
}
