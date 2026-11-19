export const TOEI_TEXT_WIDTHS = [100, 80, 70, 60] as const;
export type ToeiTextWidth = (typeof TOEI_TEXT_WIDTHS)[number];
export type ToeiWidthMeasurements = Record<ToeiTextWidth, number>;

/** Change one side first, using the widest face that fits. Prefer preserving Japanese on ties. */
export function selectToeiTextWidths(
  names: ToeiWidthMeasurements,
  translations: ToeiWidthMeasurements,
  available: number,
): { names: ToeiTextWidth; translations: ToeiTextWidth } {
  const fits = (name: ToeiTextWidth, translation: ToeiTextWidth) =>
    names[name] + translations[translation] <= available;
  if (fits(100, 100)) return { names: 100, translations: 100 };
  for (const width of TOEI_TEXT_WIDTHS.slice(1)) {
    if (fits(100, width)) return { names: 100, translations: width };
    if (fits(width, 100)) return { names: width, translations: 100 };
  }
  const pairs = TOEI_TEXT_WIDTHS.slice(1)
    .flatMap((names) => TOEI_TEXT_WIDTHS.slice(1).map((translations) => ({ names, translations })))
    .sort(
      (a, b) =>
        b.names + b.translations - (a.names + a.translations) ||
        Math.min(b.names, b.translations) - Math.min(a.names, a.translations) ||
        b.names - a.names,
    );
  return (
    pairs.find(({ names, translations }) => fits(names, translations)) || {
      names: 60,
      translations: 60,
    }
  );
}
