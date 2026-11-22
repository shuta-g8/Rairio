import symbolSvg from '../../assets/brand/Rairio-symbol.svg?raw';

const symbolMarkup = symbolSvg.slice(symbolSvg.indexOf('<defs>'), symbolSvg.lastIndexOf('</svg>'));

export const frontContour = symbolSvg.match(/<path id="rairio-symbol-front" d="([^"]+)"/)![1];

export function logoSymbolMarkup(id: string) {
  return symbolMarkup.replaceAll('rairio-symbol-', `${id}-symbol-`);
}
