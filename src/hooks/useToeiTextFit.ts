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
        if (child.firstElementChild?.classList.contains('toei-fit-text')) return width;
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
    const texts = [...heading.querySelectorAll<HTMLElement>('.toei-fit-text')];
    const nextRow = root.closest('.departure-row.second');
    function fit() {
      if (!root.isConnected || !root.clientWidth) return;
      for (const name of names) name.style.removeProperty('--toei-name-spacing');
      const available = Math.max(0, heading.clientWidth - fixedHeadingWidth(heading) - 1);
      const widths = texts.map((text) => parseFloat(getComputedStyle(text).width));
      const total = widths.reduce((width, measured) => width + measured, 0);
      const scale = Math.min(1, available / Math.max(1, total));
      const spacedName = nextRow && names.length === 1 && scale === 1 ? names[0] : undefined;

      texts.forEach((text, index) => {
        const group = text.parentElement!;
        let fittedWidth = widths[index] * scale;
        const kanjiCount = Number(group.dataset.kanjiCount);
        if (group === spacedName && kanjiCount) {
          const fontSize = parseFloat(getComputedStyle(text).fontSize);
          const spacing = Math.min(fontSize * 0.35, (available - total) / kanjiCount);
          group.style.setProperty('--toei-name-spacing', `${spacing}px`);
          fittedWidth = parseFloat(getComputedStyle(text).width);
        }
        group.style.setProperty('--toei-text-scale', String(scale));
        group.style.width = `${fittedWidth}px`;
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
