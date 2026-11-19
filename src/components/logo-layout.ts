import { LOGO_BOUNDS } from './LogoAnimation/logo-data';
import { trademarkLayout } from './trademark-data';

export function logoLayout(edition: boolean) {
  const height = LOGO_BOUNDS.height * (edition ? 1.42 : 1);
  const symbolWidth = (height * 467) / 196;
  const gap = LOGO_BOUNDS.width * 0.1;
  const trademark = trademarkLayout(LOGO_BOUNDS.height);
  const wordWidth = LOGO_BOUNDS.width + trademark.gap + trademark.width;
  return { height, symbolWidth, gap, trademark, wordWidth };
}
