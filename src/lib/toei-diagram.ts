import type { ToeiStop } from './toei-stops';
import { findStation } from './stations.ts';
import { groupStationRailways } from './railway-symbols.ts';
import { toeiMapColor, TOEI_TRANSFER_NAMES_EN } from './toei-map-labels.ts';
import type { Route } from '../types';

export type ToeiDiagramDirection = 'left' | 'right';

// Keep the map's station order fixed, including E-28/E-01 across the Oedo loop.
// Kachidoki photos show InnerLoop to the left and OuterLoop to the right:
// https://ys223.blogspot.com/2019/05/lcd.html (IMG_1156, IMG_1178, IMG_1179).
const LEFTWARD_ROUTES = new Set([
  'Toei.Asakusa.Southbound',
  'Toei.Mita.Southbound',
  'Toei.Shinjuku.Westbound',
  'Toei.Oedo.InnerLoop',
]);

export function toeiDiagramDirection(route: Pick<Route, 'id'>): ToeiDiagramDirection {
  return LEFTWARD_ROUTES.has(route.id) ? 'left' : 'right';
}

const ROUNDED_SQUARE_LINES = new Set([
  'TokyoMonorail.HanedaAirport',
  'Tobu.TobuSkytree',
  'Tokyu.Ikegami',
  'Tokyu.Oimachi',
]);

/** LCD-specific presentation stays separate from the shared railway catalog. */
export function toeiDiagramStops(stations: readonly ToeiStop[], railwayId: string) {
  return stations.map((station) => {
    const details = findStation(station.id);
    const transfers = groupStationRailways(
      (details?.availableRailways || []).filter((line) => line.id !== `Toei.${railwayId}`),
      railwayId,
    ).flatMap((group) => group.railways);
    return {
      ...station,
      english: details?.english || station.name,
      weight: toeiStopWeight(station.name, transfers.length),
      transfers: transfers.map((line) => ({
        ...line,
        color: toeiMapColor(line.id),
        japanese: line.name.replace(/^都営/, ''),
        english: line.railwayIds.map((id) => TOEI_TRANSFER_NAMES_EN[id] || line.name).join(' / '),
        jr: line.id.startsWith('JR-East.'),
        shape:
          line.id.startsWith('JR-East.') || ROUNDED_SQUARE_LINES.has(line.id)
            ? 'rounded-square'
            : 'circle',
        whiteRim: /^(Toei|Keikyu|Keisei|Hokuso)\./.test(line.id),
      })),
    };
  });
}

// Allocate space by label and transfer density, rather than physical station distance.
function toeiStopWeight(name: string, transfers: number) {
  return transfers === 0 ? 0.55 + name.length * 0.02 : 0.9 + transfers * 0.09 + name.length * 0.025;
}

export function toeiEnglishStopWeight(transfers: number) {
  return transfers ? 5.35 + transfers * 1.35 : 5.4;
}
