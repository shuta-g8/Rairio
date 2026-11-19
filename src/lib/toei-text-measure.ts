import { TOEI_TEXT_WIDTHS, type ToeiTextWidth } from './toei-text-width';

type TextRun = {
  text: string;
  family: string;
  size: string;
  weight: string;
  style: string;
  spacing: number;
};
export type ToeiTextLines = TextRun[][];
let context: CanvasRenderingContext2D | null;
const textWidths = new Map<string, number>();
const MAX_CACHED_WIDTHS = 1024;
// WebKit's DOM glyph advances can round above canvas metrics at small cqw sizes.
const TEXT_WIDTH_PADDING = 2;

/** Remeasure when the container or loaded fonts change; release both subscriptions together. */
export function observeToeiTextLayout(
  root: HTMLElement,
  measure: () => void,
  text: Iterable<HTMLElement> = [],
) {
  // Register cache invalidation before any observer responds to the new fonts.
  document.fonts.addEventListener('loadingdone', clearTextWidths);
  // The initial ResizeObserver delivery also measures newly mounted controls.
  const observer = new ResizeObserver(([entry]) => {
    if (entry.contentRect.width > 0) measure();
  });
  observer.observe(root);
  for (const element of text) observer.observe(element);
  const remeasureFonts = () => {
    if (!root.isConnected || !root.clientWidth) return;
    measure();
  };
  document.fonts.addEventListener('loadingdone', remeasureFonts);
  return () => {
    observer.disconnect();
    document.fonts.removeEventListener('loadingdone', remeasureFonts);
  };
}

function clearTextWidths() {
  textWidths.clear();
}

export function resetToeiText(element: HTMLElement) {
  element.removeAttribute('data-toei-condensed');
  element.removeAttribute('data-toei-width');
  element.style.removeProperty('font-family');
  element.style.removeProperty('width');
  element.style.removeProperty('--toei-text-scale');
}

/** Preserve the smaller kana suffixes when measuring a line. */
export function readToeiTextLines(element: HTMLElement, multiline = false): ToeiTextLines {
  const lines = multiline && element.children.length ? [...element.children] : [element];
  return lines.map((line) => {
    const runs: TextRun[] = [];
    const walker = document.createTreeWalker(line, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const node = walker.currentNode;
      if (!node.textContent) continue;
      const style = getComputedStyle(node.parentElement!);
      runs.push({
        text: node.textContent,
        family: style.fontFamily,
        size: style.fontSize,
        weight: style.fontWeight,
        style: style.fontStyle,
        spacing: parseFloat(style.letterSpacing) || 0,
      });
    }
    return runs;
  });
}

function loadedFamilies() {
  return new Set(
    [...document.fonts]
      .filter((face) => face.status === 'loaded')
      .map((face) => face.family.replace(/["']/g, '')),
  );
}

function coversText(family: string, lines: ToeiTextLines) {
  return lines.every((runs) =>
    runs.every((run) => document.fonts.check(`${run.weight} ${run.size} "${family}"`, run.text)),
  );
}

function condensedFamily(width: ToeiTextWidth, bold: boolean, language: string) {
  if (width === 100 || language === 'ko' || language === 'zh-Hans') return undefined;
  return `UDKakugoC${width}Pro-${bold ? 'B' : 'M'}`;
}

function naturalWidth(lines: ToeiTextLines, family?: string) {
  context ??= document.createElement('canvas').getContext('2d');
  if (!context) return 0;
  const canvas = context;
  return Math.max(
    0,
    ...lines.map((runs) =>
      runs.reduce((sum, run) => {
        const font = `${run.style} ${run.weight} ${run.size} ${family ? `"${family}", ` : ''}${run.family}`;
        const key = `${font}\0${run.text}`;
        let width = textWidths.get(key);
        if (width === undefined) {
          canvas.font = font;
          width = canvas.measureText(run.text).width;
          if (textWidths.size >= MAX_CACHED_WIDTHS) textWidths.clear();
          textWidths.set(key, width);
        }
        return sum + width + [...run.text].length * run.spacing;
      }, 0),
    ),
  );
}

export function measureToeiText(
  lines: ToeiTextLines,
  width: ToeiTextWidth,
  bold: boolean,
  language = 'ja',
) {
  const normal = naturalWidth(lines);
  if (width === 100) return { width: normal + TEXT_WIDTH_PADDING, scale: 1, family: undefined };
  // Retain native fonts for Hangul and simplified Chinese to avoid missing glyphs.
  const family = condensedFamily(width, bold, language);
  const loaded = family && loadedFamilies().has(family);
  if (loaded && coversText(family, lines))
    return { width: naturalWidth(lines, family) + TEXT_WIDTH_PADDING, scale: 1, family };
  // A partially loaded subset can already render some runs in the condensed face.
  // Scale the actual mixed result, otherwise those glyphs get condensed twice.
  const target = (normal * width) / 100;
  const actual = loaded ? naturalWidth(lines, family) : normal;
  return { width: target + TEXT_WIDTH_PADDING, scale: actual > 0 ? target / actual : 1, family };
}

export function toeiTextWidths(lines: ToeiTextLines, bold: boolean, language = 'ja') {
  const normal = naturalWidth(lines);
  const loaded = loadedFamilies();
  return Object.fromEntries(
    TOEI_TEXT_WIDTHS.map((width) => {
      const family = condensedFamily(width, bold, language);
      const measured =
        family && loaded.has(family) && coversText(family, lines)
          ? naturalWidth(lines, family)
          : (normal * width) / 100;
      return [width, measured + TEXT_WIDTH_PADDING];
    }),
  ) as Record<ToeiTextWidth, number>;
}

export function applyToeiTextWidth(
  element: HTMLElement,
  lines: ToeiTextLines,
  width: ToeiTextWidth,
  bold: boolean,
  language = 'ja',
  multiline = false,
) {
  const measured = measureToeiText(lines, width, bold, language);
  if (width !== 100) element.setAttribute('data-toei-width', String(width));
  if (measured.family) {
    element.setAttribute('data-toei-condensed', String(width));
    element.style.fontFamily = `"${measured.family}", ${lines[0]?.[0]?.family || 'sans-serif'}`;
  }
  element.style.setProperty('--toei-text-scale', String(measured.scale));
  element.style.width = `${multiline ? measured.width / measured.scale : measured.width}px`;
  return measured.width;
}
