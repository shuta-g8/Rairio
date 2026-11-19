import type { Plugin } from 'vite';
import { readFile } from 'node:fs/promises';

/** Include escaped characters too, since emitted JavaScript/JSON may escape Unicode. */
export function buildCodePoints(sources: string[]): Set<number> {
  const points = new Set<number>();
  for (const source of sources) {
    const decoded = source.replace(
      /\\u\{([0-9a-f]{1,6})\}|\\u([0-9a-f]{4})/gi,
      (match, wide, narrow) => {
        const point = Number.parseInt(wide || narrow, 16);
        return point <= 0x10ffff ? String.fromCodePoint(point) : match;
      },
    );
    for (const character of decoded) points.add(character.codePointAt(0)!);
  }
  return points;
}

/** Keep original font files; only avoid prefetching subsets unused by the built app. */
export function offlineFontSources(css: string, points: ReadonlySet<number>): Set<string> {
  const sources = new Set<string>();
  for (const face of css.match(/@font-face\s*\{[^}]*\}/g) || []) {
    const value = face.match(/unicode-range:\s*([^;}]+)/i)?.[1];
    const ranges = value?.split(',').map((range) => {
      const match = range.trim().match(/^U\+([0-9a-f?]{1,6})(?:-([0-9a-f]{1,6}))?$/i);
      if (!match) return null;
      const low = Number.parseInt(match[1].replaceAll('?', '0'), 16);
      const high = Number.parseInt(match[2] || match[1].replaceAll('?', 'f'), 16);
      return [low, high];
    });
    // Unknown ranges are retained rather than risking missing offline glyphs.
    const needed =
      !ranges ||
      ranges.some(
        (range) => !range || [...points].some((point) => point >= range[0] && point <= range[1]),
      );
    if (!needed) continue;
    for (const match of face.matchAll(/url\(\s*['"]?([^)'"\s]+\.woff2)['"]?\s*\)/gi))
      sources.add(match[1]);
  }
  return sources;
}

export function fontFaceCss(regular: string, bold: string): string {
  const groups = new Map<string, string[]>();
  for (const source of [regular, bold]) {
    for (const face of source.match(/@font-face\s*\{[^}]*\}/g) || []) {
      const range = face.match(/unicode-range:\s*([^;]+)/)?.[1] || '*';
      if (!groups.has(range)) groups.set(range, []);
      groups.get(range)!.push(face.replace(/,\s*url\([^)]*\.woff\)\s*format\(['"]woff['"]\)/g, ''));
    }
  }
  // Adjacent weights share long unicode ranges, allowing transport compression to reuse them.
  return [...groups.values()].flat().join('\n');
}

/** Keep every original glyph and both weights; supported browsers only need WOFF2. */
export function woff2Fonts(): Plugin {
  return {
    name: 'rairio-woff2-fonts',
    enforce: 'pre',
    async transform(source, id) {
      if (!/\/@fontsource\/line-seed-jp\/400\.css$/.test(id.replaceAll('\\', '/'))) return;
      const boldPath = id.replace(/400\.css$/, '700.css');
      this.addWatchFile(boldPath);
      return {
        code: fontFaceCss(source, await readFile(boldPath, 'utf8')),
        map: null,
      };
    },
  };
}
