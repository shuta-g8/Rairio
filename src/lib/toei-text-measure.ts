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
  element.removeAttribute('data-toei-width');
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

function naturalWidth(lines: ToeiTextLines) {
  context ??= document.createElement('canvas').getContext('2d');
  if (!context) return 0;
  const canvas = context;
  return Math.max(
    0,
    ...lines.map((runs) =>
      runs.reduce((sum, run) => {
        const font = `${run.style} ${run.weight} ${run.size} ${run.family}`;
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

export function toeiTextWidths(lines: ToeiTextLines) {
  const normal = naturalWidth(lines);
  return Object.fromEntries(
    TOEI_TEXT_WIDTHS.map((width) => [width, (normal * width) / 100 + TEXT_WIDTH_PADDING]),
  ) as Record<ToeiTextWidth, number>;
}

export function applyToeiTextWidth(
  element: HTMLElement,
  lines: ToeiTextLines,
  width: ToeiTextWidth,
  multiline = false,
) {
  const scale = width / 100;
  const measured = naturalWidth(lines) * scale + TEXT_WIDTH_PADDING;
  if (width !== 100) element.setAttribute('data-toei-width', String(width));
  element.style.setProperty('--toei-text-scale', String(scale));
  element.style.width = `${multiline ? measured / scale : measured}px`;
  return measured;
}
