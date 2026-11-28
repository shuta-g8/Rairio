import { schedulesForDate } from '../../shared/timetable-editions.ts';
import type { Departure, Route } from '../types.ts';
import { departureTimestamp, serviceDate, timetableDay } from './time.ts';
import type { ToeiInformationMessage } from './toei-guidance.ts';
import { toeiStopGuide } from './toei-stops.ts';

const SHINJUKU_REVISION = '2025-03-17T03:00:00.000Z';
type WaitingStation = 'ojima' | 'iwamotocho';
type Direction = 'Toei.Shinjuku.Eastbound' | 'Toei.Shinjuku.Westbound';
type Calendar = 'weekday' | 'weekend';
type WaitingTrips = Readonly<Record<WaitingStation, readonly string[]>>;

// The trip IDs are matched to the official table's ▼ (wait) and □/▽ (pass-wait)
// departures for the published March 2025 timetable, separately by calendar.
const WAITING_TRIPS: Readonly<Record<Direction, Record<Calendar, WaitingTrips>>> = {
  'Toei.Shinjuku.Eastbound': {
    // https://www.kotsu.metro.tokyo.jp/subway/timetable/shinjuku/n/S01ED.html
    weekday: {
      ojima: ['1710T', '1750T', '1776K', '1858T'],
      iwamotocho: ['1678K', '1762T', '1814T', '1860T'],
    },
    // https://www.kotsu.metro.tokyo.jp/subway/timetable/shinjuku/n/S01EH.html
    weekend: {
      ojima: ['1660K', '1622T'],
      iwamotocho: ['1500T', '1694K', '1628T', '1708T', '1766K'],
    },
  },
  'Toei.Shinjuku.Westbound': {
    // https://www.kotsu.metro.tokyo.jp/subway/timetable/shinjuku/S21WD.html
    weekday: {
      ojima: ['863K', '969K'],
      iwamotocho: ['621T', '831T', '911T', '929T', '1741T'],
    },
    // https://www.kotsu.metro.tokyo.jp/subway/timetable/shinjuku/S21WH.html
    weekend: {
      ojima: ['601T', '815T', '965K', '1097K'],
      iwamotocho: ['729T', '803T', '1061K'],
    },
  },
};

export function toeiWaitingNotice(
  route: Route,
  train: Departure | undefined,
  now: Date,
): ToeiInformationMessage | undefined {
  if (
    !train ||
    train.type !== '普通' ||
    train.serviceDate !== serviceDate(now) ||
    route.sourceUpdated !== SHINJUKU_REVISION ||
    (route.id !== 'Toei.Shinjuku.Eastbound' && route.id !== 'Toei.Shinjuku.Westbound')
  )
    return;

  const day = timetableDay(route, train.serviceDate);
  const calendar = day === 'weekday' ? 'weekday' : 'weekend';
  const effective = calendar === 'weekday' ? '2025-03-17' : '2025-03-15';
  if (day !== train.day || train.serviceDate < effective) return;
  const number = /^odpt\.Train:Toei\.Shinjuku\.(\w+)$/.exec(train.trainId ?? '')?.[1];
  if (!number) return;
  const trips = WAITING_TRIPS[route.id][calendar];
  const stationId = (['ojima', 'iwamotocho'] as const).find((id) => trips[id].includes(number));
  if (!stationId) return;

  const entries = schedulesForDate(route, train.serviceDate)?.[day]?.filter(
    (entry) => entry.trainId === train.trainId,
  );
  if (entries?.length !== 1) return;
  const [scheduled] = entries;
  if (
    scheduled.type !== train.type ||
    scheduled.destination !== train.destination ||
    departureTimestamp(train.serviceDate, scheduled.time, scheduled.dayOffset) !== train.timestamp
  )
    return;

  const station = toeiStopGuide(route, train)?.stations.find(
    (stop) => stop.id === stationId && stop.kind === 'stop',
  );
  if (!station) return;
  return {
    id: `waiting-${stationId}`,
    segments: [
      { text: `${station.name}で`, tone: 'white' },
      { text: '急行', tone: 'orange' },
      { text: `の${stationId === 'ojima' ? '待ち合わせ' : '通過待ち'}をします。`, tone: 'white' },
    ],
  };
}
