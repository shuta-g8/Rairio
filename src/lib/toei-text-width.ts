export const TOEI_TEXT_WIDTHS = [100, 80, 70, 60] as const;
export type ToeiTextWidth = (typeof TOEI_TEXT_WIDTHS)[number];
export type ToeiWidthMeasurements = Record<ToeiTextWidth, number>;

/** Use the widest face that fits the allocated column. */
export function selectToeiTextWidth(
  measurements: ToeiWidthMeasurements,
  available: number,
): ToeiTextWidth {
  return TOEI_TEXT_WIDTHS.find((width) => measurements[width] <= available) ?? 60;
}
