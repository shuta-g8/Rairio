export const TRADEMARK_ART = {
  width: 50,
  height: 26,
  path: 'M0 0H18V4H11V26H7V4H0ZM24 26V0H29L37 16L45 0H50V26H46V7L39 21H35L28 7V26Z',
} as const;

export function trademarkLayout(wordHeight: number) {
  const height = wordHeight * 0.11;
  return {
    height,
    width: (height * TRADEMARK_ART.width) / TRADEMARK_ART.height,
    gap: wordHeight * 0.055,
    y: wordHeight * 0.015,
  };
}
