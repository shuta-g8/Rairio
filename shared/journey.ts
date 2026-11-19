export type JourneyLine = 'Asakusa' | 'Mita' | 'Shinjuku' | 'Oedo';

/** Times are minutes after the GTFS service day's midnight, including 24:xx. */
export type JourneyStopTime = [stop: string, arrival: number, departure: number, flags: number];
export interface JourneyTrip {
  id: string;
  line: JourneyLine;
  service: string;
  headsign: string;
  stops: JourneyStopTime[];
}
export interface JourneyData {
  version: 1;
  fetchedAt: string;
  feedVersion: string;
  source: string;
  sourceSha256: string;
  provider: string;
  license: string;
  startDate: string;
  endDate: string;
  lineEndDates: Partial<Record<JourneyLine, string>>;
  stops: Record<string, { station: string; name: string; line: JourneyLine }>;
  calendars: { id: string; weekdays: number[]; start: string; end: string }[];
  exceptions: { service: string; date: string; added: boolean }[];
  trips: JourneyTrip[];
  /** Adult IC fare, keyed by the physical Toei station pair. */
  fares: Record<string, number>;
  transfers: { from: string; to: string; minutes: number }[];
}

export function fareKey(from: string, to: string): string {
  return [from, to].sort().join('|');
}

export const JOURNEY_LINES: Record<JourneyLine, { name: string; color: string }> = {
  Asakusa: { name: '都営浅草線', color: '#d73b50' },
  Mita: { name: '都営三田線', color: '#0067b0' },
  Shinjuku: { name: '都営新宿線', color: '#657e00' },
  Oedo: { name: '都営大江戸線', color: '#b52b65' },
};
