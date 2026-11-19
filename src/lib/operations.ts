import {
  OPERATIONS_INTERVAL,
  OPERATIONS_SOURCE,
  operationSourceUrl,
  RAILWAYS,
  RAILWAY_GROUPS,
  OPERATION_STATES,
  worstState,
  type LineOperation,
  type OperationsSnapshot,
  type OperationState,
} from '../../shared/railways.ts';
import { readStoredJson, writeStoredJson } from './storage.ts';

export { worstState } from '../../shared/railways.ts';

export const OPERATIONS_CACHE_KEY = 'rairio:toei:operations:v1';
export interface OperationsData {
  snapshot: OperationsSnapshot | null;
  online: boolean;
  current: boolean;
  loading: boolean;
}
const announcementTimeFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Tokyo',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

export const COMPANY_STATUS: Record<OperationState, string> = {
  normal: '15分以上の遅延なし',
  delayed: '遅延情報あり',
  suspended: '運休・見合わせ',
  other: '運行情報あり',
  unknown: '情報未取得',
};

export function indexOperations(
  snapshot: OperationsSnapshot | null,
): ReadonlyMap<string, LineOperation> {
  return new Map(snapshot?.lines.map((line) => [line.id, line]));
}

export function groupOperations(snapshot: OperationsSnapshot | null) {
  const byId = indexOperations(snapshot);
  return RAILWAY_GROUPS.map(({ operator, railways }) => {
    const lines = railways.map((railway) => ({ railway, operation: byId.get(railway.id) }));
    return {
      operator,
      lines,
      state: worstState(lines.map(({ operation }) => operation?.state || 'unknown')),
    };
  });
}

export function validSnapshot(value: unknown): value is OperationsSnapshot {
  if (!value || typeof value !== 'object') return false;
  const snapshot = value as OperationsSnapshot;
  return (
    snapshot.version === 1 &&
    typeof snapshot.fetchedAt === 'string' &&
    Number.isFinite(Date.parse(snapshot.fetchedAt)) &&
    typeof snapshot.cached === 'boolean' &&
    typeof snapshot.sourceUpdated === 'string' &&
    snapshot.sourceUrl === OPERATIONS_SOURCE &&
    Array.isArray(snapshot.lines) &&
    snapshot.lines.length > 0 &&
    snapshot.lines.every(
      (line) =>
        line &&
        typeof line === 'object' &&
        RAILWAYS.some((railway) => railway.id === line.id) &&
        OPERATION_STATES.includes(line.state) &&
        typeof line.status === 'string' &&
        typeof line.message === 'string' &&
        typeof line.operator === 'string' &&
        typeof line.name === 'string' &&
        (line.updatedAt === undefined ||
          (typeof line.updatedAt === 'string' && Number.isFinite(Date.parse(line.updatedAt)))) &&
        (line.announcedAt === undefined ||
          (typeof line.announcedAt === 'string' &&
            Number.isFinite(Date.parse(line.announcedAt)))) &&
        line.sourceUrl === operationSourceUrl(line.id),
    ) &&
    new Set(snapshot.lines.map((line) => line.id)).size === snapshot.lines.length
  );
}

export function loadOperations(): OperationsSnapshot | null {
  return readStoredJson(OPERATIONS_CACHE_KEY, validSnapshot);
}

export function saveOperations(snapshot: OperationsSnapshot) {
  writeStoredJson(OPERATIONS_CACHE_KEY, snapshot);
}

export function operationsAreOld(snapshot: OperationsSnapshot | null, now: Date): boolean {
  return (
    !snapshot ||
    snapshot.cached ||
    now.getTime() - Date.parse(snapshot.fetchedAt) > OPERATIONS_INTERVAL
  );
}

export function operationsArePrevious(operations: OperationsData, now: Date): boolean {
  return !operations.online || !operations.current || operationsAreOld(operations.snapshot, now);
}

/** Refresh when the server cache expires, with a five-minute retry after failure. */
export function operationsRefreshDelay(snapshot: OperationsSnapshot, now: number): number {
  const remaining = Date.parse(snapshot.fetchedAt) + OPERATIONS_INTERVAL - now;
  if (snapshot.cached || remaining <= 0) return OPERATIONS_INTERVAL;
  return Math.max(1000, Math.min(OPERATIONS_INTERVAL, remaining));
}

/** Summarize only our covered routes; missing data must never imply normal service. */
export function summarizeOperations(snapshot: OperationsSnapshot | null): {
  state: OperationState;
  text: string;
} {
  if (!snapshot) return { state: 'unknown', text: '運行情報はまだ取得できていません。' };
  const byId = indexOperations(snapshot);
  const routes = RAILWAYS.map((railway) => ({
    railway,
    operation: byId.get(railway.id),
  }));
  const states = routes.map(({ operation }) => operation?.state || 'unknown');
  const state = worstState(states);
  if (state === 'normal')
    return { state, text: '都営地下鉄4路線で、15分以上の遅延情報はありません。' };

  const notices = routes.flatMap(({ railway, operation }) => {
    if (!operation || operation.state === 'normal' || operation.state === 'unknown') return [];
    // Preserve the source's station, cause and affected section without inventing details.
    const detail = operation.message.replace(/\s+/gu, ' ').trim() || operation.status;
    const announcement = operation.announcedAt
      ? `（${announcementTimeFormatter.format(new Date(operation.announcedAt)).replace(':', '時')}分発表）`
      : '';
    return [
      `${railway.operator}・${railway.name}：${detail}${/[。！？!?]$/u.test(detail) ? '' : '。'}${announcement}`,
    ];
  });
  if (notices.length) return { state, text: notices.join('　') };

  const unknown = states.filter((value) => value === 'unknown').length;
  return { state, text: `${unknown}路線の運行情報が未確認です。` };
}
