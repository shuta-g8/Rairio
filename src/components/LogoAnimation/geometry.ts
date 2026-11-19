import { LOGO_BOUNDS } from './logo-data';
import { logoLayout } from '../logo-layout';

// Match the static lockup: the symbol spans the wordmark and its edition line.
const { height: stackHeight, symbolWidth, gap, trademark, wordWidth } = logoLayout(true);
export const LOGO_LAYOUT = {
  symbolWidth,
  stackHeight,
  symbolX: -symbolWidth - gap,
  symbolStartOffset: (wordWidth + gap) / 2,
  trademarkX: LOGO_BOUNDS.width + trademark.gap,
  trademarkY: trademark.y,
  trademarkHeight: trademark.height,
  wordStartY: (stackHeight - LOGO_BOUNDS.height) / 2,
  editionBaseline: stackHeight - LOGO_BOUNDS.height * 0.04,
  editionFontSize: LOGO_BOUNDS.height * 0.28,
  canvasWidth: symbolWidth + gap + wordWidth + 80,
  canvasHeight: stackHeight + 72,
} as const;
export const VIEW_BOX = `${LOGO_LAYOUT.symbolX - 40} -36 ${LOGO_LAYOUT.canvasWidth} ${LOGO_LAYOUT.canvasHeight}`;

// A solid outer envelope hides rear lettering through both loop openings too.
export const SYMBOL_OCCLUSION =
  'M660 350C625 327 592 315 563 315C519 315 484 338 477 370C468 409 494 438 546 439C587 440 625 418 663 391C714 427 764 459 817 459C887 459 942 418 942 359C942 306 895 263 833 263C768 263 711 306 660 350Z';

// Close behind the middle of the front ribbon, not along its visible edge.
// Continue over the front ribbon and return along the rear to close the loop.
export const SYMBOL_ROUTES = [
  {
    part: 'rear-start',
    d: 'M649 355C627 338 594 331 563 331C524 331 494 350 494 375',
  },
  {
    part: 'front',
    d: 'M494 375C490 403 515 422 551 422C601 422 645 393 678 370C735 327 782 286 832 286C882 286 920 318 920 360',
  },
  {
    part: 'rear-end',
    d: 'M920 360C920 407 874 437 817 437C765 437 719 409 649 355',
  },
] as const;
