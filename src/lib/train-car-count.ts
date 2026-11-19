import type { Departure, Route } from '../types';
import { lineSymbol } from './stations.ts';

export function validCarCount(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 && value <= 20
    ? value
    : undefined;
}

// All Oedo services use 8 cars; all Shinjuku services use 10 cars.
// https://www.kotsu.metro.tokyo.jp/about/service/subway.html
// https://www.kotsu.metro.tokyo.jp/pickup_information/news/subway/2022/sub_i_2022072810548_h.html
// Do not infer a count for Asakusa/Mita, where formations vary by train.
export function trainCarCount(route: Route, departure: Departure): number | undefined {
  const explicit = validCarCount(departure.carCount) ?? validCarCount(route.carCount);
  if (explicit !== undefined) return explicit;
  const symbol = lineSymbol(route.line);
  if (route.railwayId === 'Oedo' || (!route.railwayId && symbol === 'E')) return 8;
  if (route.railwayId === 'Shinjuku' || (!route.railwayId && symbol === 'S')) return 10;
  return undefined;
}
