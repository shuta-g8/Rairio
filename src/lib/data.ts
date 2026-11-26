import type { StationData } from '../types';
import { readStoredJson, writeStoredJson } from './storage';
import { TIMETABLE_SOURCE, TOEI_OPERATOR } from '../../shared/transit-source';
import { verifyStationTimetables } from './timetable-data';

function validStation(value: unknown, id: string): value is StationData {
  if (!value || typeof value !== 'object') return false;
  const data = value as StationData;
  return (
    data.id === id &&
    data.sourceUrl === TIMETABLE_SOURCE &&
    data.sourceId === TOEI_OPERATOR &&
    Array.isArray(data.routes) &&
    data.routes.length > 0 &&
    Number.isFinite(Date.parse(data.fetchedAt))
  );
}

function savedStation(id: string): StationData | null {
  return readStoredJson(`rairio:toei:station:v1:${id}`, (value): value is StationData =>
    validStation(value, id),
  );
}

export async function fetchStation(
  id: string,
  signal: AbortSignal,
  date?: string,
): Promise<StationData> {
  // Avoid parsing a saved timetable on the normal, successful network path.
  if (!navigator.onLine) {
    const saved = savedStation(id);
    if (saved) return verifyStationTimetables(saved, signal, date);
  }
  try {
    const response = await fetch(`${import.meta.env.BASE_URL}data/${id}.json`, {
      signal: AbortSignal.any([signal, AbortSignal.timeout(6000)]),
      cache: 'no-cache',
    });
    if (!response.ok)
      throw new Error('時刻表を読み込めませんでした。通信状態を確認して、もう一度お試しください。');
    const data: unknown = await response.json();
    if (!validStation(data, id))
      throw new Error(
        '時刻表データを確認できませんでした。しばらくしてから、もう一度お試しください。',
      );
    const verified = await verifyStationTimetables(data, signal, date);
    if (signal.aborted) throw signal.reason;
    writeStoredJson(`rairio:toei:station:v1:${id}`, verified);
    return verified;
  } catch (error) {
    if (signal.aborted) throw error;
    const saved = savedStation(id);
    if (saved) return verifyStationTimetables(saved, signal, date);
    throw error;
  }
}
