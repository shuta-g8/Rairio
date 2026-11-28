import type { Station } from '../shared/stations';
import type { GtfsDeparture, NaritaVia, VerifiedRouteEdition } from '../shared/timetable-editions';
export type { DirectoryStation as Station } from '../shared/station-directory';

export type DayKind = 'weekday' | 'saturday' | 'holiday';
export interface Train {
  trainId?: string;
  time: string;
  destination: string;
  type: string;
  platform?: string;
  extra?: boolean;
  dayOffset?: number;
  carCount?: number;
  gtfs?: GtfsDeparture;
  naritaVia?: NaritaVia;
}
export interface Route {
  id: string;
  line: string;
  direction: string;
  color: string;
  sourceUrl: string;
  schedules: Record<DayKind, Train[]>;
  railwayId?: string;
  sourceStationId?: string;
  sourceTimetableIds?: string[];
  sourceUpdated?: string;
  carCount?: number;
  timetableEditions?: VerifiedRouteEdition[];
  timetableUnavailable?: boolean;
}
export interface StationData extends Station {
  sourceLicense?: string;
  sourceProvider?: string;
  sourceUpdated?: string;
  sourceId: string;
  sourceUrl: string;
  fetchedAt: string;
  routes: Route[];
}
export interface Departure extends Train {
  timestamp: number;
  serviceDate: string;
  day: DayKind;
}
