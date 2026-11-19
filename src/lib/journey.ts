import {
  fareKey,
  type JourneyData,
  type JourneyLine,
  type JourneyTrip,
} from '../../shared/journey.ts';
import { addDays } from './time.ts';

export interface RideLeg {
  kind: 'ride';
  line: JourneyLine;
  trip: string;
  headsign: string;
  from: string;
  to: string;
  departure: number;
  arrival: number;
  stops: number;
}
export interface WalkLeg {
  kind: 'walk';
  from: string;
  to: string;
  departure: number;
  arrival: number;
}
export type JourneyLeg = RideLeg | WalkLeg;
export interface Journey {
  serviceDate: string;
  departure: number;
  arrival: number;
  legs: JourneyLeg[];
  icFare?: number;
}
interface Label {
  at: number;
  legs: JourneyLeg[];
}

export function journeyRequest(date: string, time: string): { date: string; minutes: number } {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time))
    throw new Error('出発日と時刻を入力してください。');
  const parsed = new Date(`${date}T00:00:00Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date)
    throw new Error('出発日を確認してください。');
  const [h, m] = time.split(':').map(Number);
  return { date: h < 4 ? addDays(date, -1) : date, minutes: (h < 4 ? h + 24 : h) * 60 + m };
}

export function serviceTrips(data: JourneyData, date: string): JourneyTrip[] {
  if (date < data.startDate || date > data.endDate) return [];
  const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
  const services = new Set(
    data.calendars
      .filter((c) => date >= c.start && date <= c.end && c.weekdays.includes(weekday))
      .map((c) => c.id),
  );
  for (const exception of data.exceptions) {
    if (exception.date !== date) continue;
    if (exception.added) services.add(exception.service);
    else services.delete(exception.service);
  }
  return data.trips.filter(
    (t) =>
      services.has(t.service) && (!data.lineEndDates[t.line] || date < data.lineEndDates[t.line]!),
  );
}

function walkTransfers(data: JourneyData, labels: Map<string, Label>) {
  // All edges have positive duration. Repeated relaxation handles connected walkways.
  let changed = true;
  while (changed) {
    changed = false;
    for (const edge of data.transfers) {
      const previous = labels.get(edge.from);
      if (!previous || (labels.get(edge.to)?.at ?? Infinity) <= previous.at + edge.minutes)
        continue;
      labels.set(edge.to, {
        at: previous.at + edge.minutes,
        legs: [
          ...previous.legs,
          {
            kind: 'walk',
            from: edge.from,
            to: edge.to,
            departure: previous.at,
            arrival: previous.at + edge.minutes,
          },
        ],
      });
      changed = true;
    }
  }
}

/** Round-based earliest arrival: immutable boarding labels prevent impossible connections. */
function earliest(
  data: JourneyData,
  trips: JourneyTrip[],
  from: string,
  to: string,
  date: string,
  start: number,
): Journey | undefined {
  let labels = new Map<string, Label>();
  for (const [id, stop] of Object.entries(data.stops))
    if (stop.station === from) labels.set(id, { at: start, legs: [] });
  walkTransfers(data, labels);
  for (let round = 0; round < 4; round++) {
    const next = new Map(labels);
    for (const trip of trips) {
      let boarding: { index: number; label: Label } | undefined;
      for (let i = 0; i < trip.stops.length; i++) {
        const [stop, arrival, departure, flags] = trip.stops[i];
        if (boarding && flags & 2 && arrival < (next.get(stop)?.at ?? Infinity)) {
          const first = trip.stops[boarding.index];
          next.set(stop, {
            at: arrival,
            legs: [
              ...boarding.label.legs,
              {
                kind: 'ride',
                line: trip.line,
                trip: trip.id,
                headsign: trip.headsign,
                from: first[0],
                to: stop,
                departure: first[2],
                arrival,
                stops: i - boarding.index,
              },
            ],
          });
        }
        if (!boarding && flags & 1) {
          const previous = labels.get(stop);
          // A different train at the same line-station still needs time to change.
          const margin = previous?.legs.at(-1)?.kind === 'ride' ? 2 : 0;
          if (previous && previous.at + margin <= departure)
            boarding = { index: i, label: previous };
        }
      }
    }
    walkTransfers(data, next);
    labels = next;
  }
  const options = [...labels]
    .filter(([id, l]) => data.stops[id].station === to && l.legs.length)
    .map(([, l]) => l);
  options.sort((a, b) => a.at - b.at || a.legs.length - b.legs.length);
  const best = options[0];
  if (!best) return;
  return {
    serviceDate: date,
    departure: best.legs[0].departure,
    arrival: best.at,
    legs: best.legs,
    icFare: best.legs.some((l) => l.kind === 'ride') ? data.fares[fareKey(from, to)] : 0,
  };
}

export function searchJourneys(
  data: JourneyData,
  from: string,
  to: string,
  date: string,
  start: number,
  count = 3,
): Journey[] {
  if (from === to) return [];
  const trips = serviceTrips(data, date);
  const result: Journey[] = [];
  let cursor = start;
  for (let i = 0; i < Math.min(count, 5); i++) {
    const journey = earliest(data, trips, from, to, date, cursor);
    if (!journey) break;
    result.push(journey);
    const firstRide = journey.legs.find((l) => l.kind === 'ride');
    if (!firstRide) break;
    // Advance past the first train. Waiting after an initial walkway is not walking time.
    let walking = 0;
    for (const leg of journey.legs) {
      if (leg.kind === 'ride') break;
      walking += leg.arrival - leg.departure;
    }
    cursor = firstRide.departure + 1 - walking;
    if (cursor <= start) break;
  }
  return result;
}

export function journeyTime(minutes: number): string {
  return `${minutes >= 1440 ? '翌' : ''}${String(Math.floor(minutes / 60) % 24).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}

// Toei's published standard fare bands; do not apply this to other operators.
export function journeyFare(
  ic: number | undefined,
  ticket: 'ic' | 'paper',
  child: boolean,
): number | undefined {
  if (ic === undefined) return;
  const paper: Record<number, number> = {
    0: 0,
    178: 180,
    220: 220,
    272: 280,
    325: 330,
    377: 380,
    430: 430,
  };
  const fare = ticket === 'ic' ? ic : paper[ic];
  if (fare === undefined) return;
  return child ? (ticket === 'ic' ? Math.floor(fare / 2) : Math.ceil(fare / 20) * 10) : fare;
}

export function validateJourneyData(value: unknown): JourneyData {
  const d = value as JourneyData;
  if (
    !d ||
    d.version !== 1 ||
    !d.stops ||
    !Array.isArray(d.trips) ||
    d.trips.length < 2000 ||
    !Array.isArray(d.calendars) ||
    !Array.isArray(d.exceptions) ||
    !Array.isArray(d.transfers) ||
    !d.fares ||
    !d.lineEndDates ||
    !/^\d{4}-\d{2}-\d{2}$/.test(d.startDate) ||
    !/^\d{4}-\d{2}-\d{2}$/.test(d.endDate)
  )
    throw new Error('経路案内のデータを読み込めませんでした。');
  return d;
}
