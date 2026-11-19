import { isHoliday } from './holidays.ts';
import type { DayKind, Departure, Route } from '../types.ts';
import {
  schedulesForDate,
  managesTimetable,
  ASAKUSA_CUTOVER,
} from '../../shared/timetable-editions.ts';

const JST = 9 * 60 * 60 * 1000;
const DAY = 24 * 60 * 60 * 1000;
export const ARRIVAL_NOTICE_MS = 60_000;
export const DEPARTURE_NOTICE_BEFORE_MS = 15_000;
export const DEPARTURE_NOTICE_AFTER_MS = 5_000;
export const DEPARTURE_HOLD_MS = 20_000;
export const DEPARTURE_PROGRESS_MS = DEPARTURE_HOLD_MS - DEPARTURE_NOTICE_AFTER_MS;
export const DAY_LABEL: Record<DayKind, string> = {
  weekday: '平日',
  saturday: '土曜',
  holiday: '日曜・祝日',
};

export function japanDate(now: Date): string {
  return new Date(now.getTime() + JST).toISOString().slice(0, 10);
}

/** Compare civil dates in JST, including retained announcements from yesterday. */
export function isFutureJapanDate(timestamp: number, now: Date): boolean {
  return japanDate(new Date(timestamp)) > japanDate(now);
}

export function japanHour(now: Date): number {
  return new Date(now.getTime() + JST).getUTCHours();
}

// Timetables treat 0–3 AM as part of the preceding service day unless specified.
export function serviceHour(hour: number, dayOffset = hour < 4 ? 1 : 0): number {
  return hour + dayOffset * 24;
}

export function addDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY).toISOString().slice(0, 10);
}

export function dayKind(date: string): DayKind {
  const [year, month, day] = date.split('-').map(Number);
  const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
  // holiday_jp uses local date components: construct a local civil date deliberately.
  const holiday = isHoliday(new Date(year, month - 1, day));
  const newYear = (month === 12 && day >= 30) || (month === 1 && day <= 3);
  if (weekday === 0 || holiday || newYear) return 'holiday';
  return weekday === 6 ? 'saturday' : 'weekday';
}

let lastServiceTimestamp: number | undefined;
let lastServiceDate = '';

export function serviceDate(now: Date): string {
  const timestamp = now.getTime();
  if (timestamp === lastServiceTimestamp) return lastServiceDate;
  const date = japanDate(now);
  const hour = japanHour(now);
  const result = hour < 4 ? addDays(date, -1) : date;
  // Every route shares the current tick. Compare the value so mutable Dates and
  // clock changes still recompute, and retain only one successfully resolved tick.
  lastServiceTimestamp = timestamp;
  lastServiceDate = result;
  return result;
}

export function departureTimestamp(date: string, time: string, dayOffset?: number): number {
  const [hour, minute] = time.split(':').map(Number);
  return (
    Date.parse(`${date}T00:00:00+09:00`) + (serviceHour(hour, dayOffset) * 60 + minute) * 60000
  );
}

export function nextDepartures(route: Route, now: Date, count = 2): Departure[] {
  return findDepartures(route, now, count, 0);
}

export function boardDepartures(route: Route, now: Date, count = 2): Departure[] {
  return findDepartures(route, now, count, DEPARTURE_HOLD_MS);
}

/** Cached schedule entries, visited lazily so live boards can inspect delayed trains. */
export function* liveDepartureCandidates(route: Route, now: Date, lookbackMs: number) {
  const departures = prepareDepartures(route, serviceDate(now));
  let first = 0;
  let last = departures.length;
  while (first < last) {
    const middle = (first + last) >>> 1;
    if (departures[middle].timestamp < now.getTime() - lookbackMs) first = middle + 1;
    else last = middle;
  }
  for (let index = first; index < departures.length; index++) yield departures[index];
}

export type DepartureBoardState =
  | { kind: 'active'; departures: Departure[] }
  | { kind: 'ended'; nextDeparture: Departure }
  | { kind: 'empty' };

export function departureIdentity(departure: Departure): string {
  return `${departure.serviceDate}/${departure.timestamp}/${departure.trainId || ''}/${departure.destination}/${departure.type}`;
}

export function departureBoardState(
  route: Route,
  now: Date,
  after?: Departure,
): DepartureBoardState {
  const departures = findDepartures(route, now, 2, DEPARTURE_HOLD_MS, after);
  if (!departures.length) return { kind: 'empty' };
  if (departures[0].serviceDate > serviceDate(now)) {
    return { kind: 'ended', nextDeparture: departures[0] };
  }
  return { kind: 'active', departures };
}

interface PreparedDepartures {
  start: string;
  schedules: Route['schedules'];
  weekday: Route['schedules']['weekday'];
  saturday: Route['schedules']['saturday'];
  holiday: Route['schedules']['holiday'];
  editions: Route['timetableEditions'];
  departures: Departure[];
}

// Fetched schedules are immutable. Keep only the current window for each live route;
// old stations can be collected, and a new dataset or calendar always rebuilds it.
const preparedRoutes = new WeakMap<Route, PreparedDepartures>();

function prepareDepartures(route: Route, start: string): Departure[] {
  const cached = preparedRoutes.get(route);
  const schedules = route.schedules;
  if (
    cached?.start === start &&
    cached.schedules === schedules &&
    cached.weekday === schedules.weekday &&
    cached.saturday === schedules.saturday &&
    cached.holiday === schedules.holiday &&
    cached.editions === route.timetableEditions
  )
    return cached.departures;
  const departures: Departure[] = [];
  // The preceding service day may contain overnight trains expressed as 30:xx.
  // Also include tomorrow's first trains, with their own calendar.
  for (let offset = -1; offset < 3; offset++) {
    const date = addDays(start, offset);
    // Do not surface a future edition early in tomorrow's card, or retain a
    // preceding edition after the boundary. Within an edition calendars vary.
    if (managesTimetable(route) && date < ASAKUSA_CUTOVER !== start < ASAKUSA_CUTOVER) continue;
    const day = dayKind(date);
    const applicable = schedulesForDate(route, date);
    if (!applicable) continue;
    for (const train of applicable[day]) {
      const timestamp = departureTimestamp(date, train.time, train.dayOffset);
      if (!Number.isNaN(timestamp))
        departures.push({ ...train, timestamp, serviceDate: date, day });
    }
  }
  departures.sort((a, b) => a.timestamp - b.timestamp);
  preparedRoutes.set(route, {
    start,
    schedules,
    ...schedules,
    editions: route.timetableEditions,
    departures,
  });
  return departures;
}

function findDepartureIndex(departures: Departure[], target: Departure): number {
  let first = 0;
  let last = departures.length;
  while (first < last) {
    const middle = (first + last) >>> 1;
    if (departures[middle].timestamp < target.timestamp) first = middle + 1;
    else last = middle;
  }
  const identity = departureIdentity(target);
  for (
    let index = first;
    index < departures.length && departures[index].timestamp === target.timestamp;
    index++
  )
    if (departureIdentity(departures[index]) === identity) return index;
  return -1;
}

function findDepartures(
  route: Route,
  now: Date,
  count: number,
  holdMs: number,
  after?: Departure,
): Departure[] {
  const departures = prepareDepartures(route, serviceDate(now));
  const nowMs = now.getTime();
  let first = 0;
  let last = departures.length;
  while (first < last) {
    const middle = (first + last) >>> 1;
    const timestamp = departures[middle].timestamp;
    const visible = holdMs > 0 ? timestamp + holdMs > nowMs : timestamp >= nowMs;
    if (visible) last = middle;
    else first = middle + 1;
  }
  if (after) {
    const completed = findDepartureIndex(departures, after);
    first = Math.max(first, completed + 1);
  }
  // The board usually needs two trains, not a copy of every remaining train.
  // Preserve slice's existing semantics for negative, fractional and nonfinite counts.
  const selected =
    Number.isSafeInteger(count) && count >= 0
      ? departures.slice(first, first + count)
      : departures.slice(first).slice(0, count);
  return selected.map((departure) => ({ ...departure }));
}

export type DeparturePresentation =
  | { kind: 'countdown' }
  | { kind: 'approaching' }
  | { kind: 'stopped' }
  | { kind: 'departing' }
  | { kind: 'progress'; elapsedMs: number; progress: number }
  | { kind: 'expired' };

export function departurePresentation(
  timestamp: number,
  now: Date,
  liveApproaching?: boolean,
): DeparturePresentation {
  if (liveApproaching !== undefined) return { kind: liveApproaching ? 'approaching' : 'countdown' };
  const elapsedMs = now.getTime() - timestamp;
  if (elapsedMs >= DEPARTURE_HOLD_MS) return { kind: 'expired' };
  if (elapsedMs >= DEPARTURE_NOTICE_AFTER_MS) {
    const progressElapsedMs = elapsedMs - DEPARTURE_NOTICE_AFTER_MS;
    return {
      kind: 'progress',
      elapsedMs: progressElapsedMs,
      progress: progressElapsedMs / DEPARTURE_PROGRESS_MS,
    };
  }
  if (elapsedMs >= -DEPARTURE_NOTICE_BEFORE_MS) return { kind: 'departing' };
  return -elapsedMs <= ARRIVAL_NOTICE_MS ? { kind: 'approaching' } : { kind: 'countdown' };
}

export function remaining(timestamp: number, now: Date): { minutes: number; seconds: number } {
  const seconds = Math.max(0, Math.ceil((timestamp - now.getTime()) / 1000));
  return { minutes: Math.floor(seconds / 60), seconds: seconds % 60 };
}
