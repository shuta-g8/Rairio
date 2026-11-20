import type { JourneyLine } from './journey.ts';

export interface OnlineJourneyLeg {
  from: string;
  to: string;
  fromCode?: string;
  toCode?: string;
  start: number;
  end: number;
  line: string;
  headsign?: string;
  routeColor?: string;
  railwayId?: string;
  toei: boolean;
  toeiLine?: JourneyLine;
  through: boolean;
  walk: boolean;
}

export interface OnlineJourney {
  id: number;
  start: number;
  end: number;
  transfers: number;
  legs: OnlineJourneyLeg[];
}

export type OnlineJourneyPlan = { routes: OnlineJourney[] } & (
  | { fareAvailability: 'ready'; fareToken: string }
  | { fareAvailability: 'disabled' | 'no-candidate'; fareToken?: undefined }
);

export interface OnlineJourneyFare {
  id: number;
  ticket: number;
  ic?: number;
}
export function servesToeiSurfaceRail(lines: readonly string[]) {
  return lines.includes('99305') || lines.includes('99342');
}
