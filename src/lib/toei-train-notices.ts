import { schedulesForDate } from '../../shared/timetable-editions.ts';
import type { Departure, Route, Train } from '../types.ts';
import { destinationPresentation } from './destinations.ts';
import { departureIdentity, departureTimestamp, serviceDate, timetableDay } from './time.ts';
import type { ToeiInformationMessage } from './toei-guidance.ts';
import { toeiStationName, type ToeiDisplayLanguage } from './toei-language.ts';
import type { ToeiStopGuide } from './toei-stops.ts';

export interface ToeiLastTrainMessage {
  id: string;
  translations: Partial<Record<ToeiDisplayLanguage, string>> & { ja: string };
}

export function toeiStopListMessage(
  guide: ToeiStopGuide | undefined,
): ToeiInformationMessage | undefined {
  const stops = guide?.stations.filter((station) => station.kind === 'stop');
  if (!stops?.length) return;
  const names = stops.map((station) => station.name).join('、');
  return {
    id: 'stop-list',
    segments: [
      { text: '【停車駅】', tone: 'orange' },
      { text: guide?.through ? `${names}（都営線内）` : names, tone: 'white' },
    ],
  };
}

/** Compare the displayed trip with all services to its destination on its service day. */
export function toeiLastTrainMessage(
  route: Route,
  train: Departure | undefined,
  now: Date,
): ToeiLastTrainMessage | undefined {
  if (!train || train.extra || train.serviceDate !== serviceDate(now)) return;
  const date = train.serviceDate;
  const day = timetableDay(route, date);
  const schedule: Train[] | undefined = schedulesForDate(route, date)?.[day];
  if (train.day !== day || !schedule) return;

  const identity = departureIdentity(train);
  let matches = 0;
  let idMatches = 0;
  for (const entry of schedule) {
    if (train.trainId && entry.trainId === train.trainId) idMatches++;
    if (entry.destination !== train.destination) continue;
    const timestamp = departureTimestamp(date, entry.time, entry.dayOffset);
    if (departureIdentity({ ...entry, timestamp, serviceDate: date, day }) === identity) {
      if (entry.extra) return;
      matches++;
    } else if (timestamp >= train.timestamp) return;
  }
  if (matches !== 1 || idMatches > 1) return;

  const { name, english } = destinationPresentation(train.destination);
  if (!name || name === '環状運転' || name === '不明') return;
  const chinese = toeiStationName(name, 'zh-Hans');
  const korean = toeiStationName(name, 'ko');
  return {
    id: `last-train/${identity}`,
    translations: {
      ja: `${name}行きの最終電車です。`,
      ...(english && { en: `This is the last train for ${english}.` }),
      ...(chinese && { 'zh-Hans': `这是开往${chinese}的末班车。` }),
      ...(korean && { ko: `이 열차는 ${korean}행 막차입니다.` }),
    },
  };
}
