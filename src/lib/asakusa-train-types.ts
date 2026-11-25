import type { VerifiedRouteEdition } from '../../shared/timetable-editions.ts';
import labelsByEdition from '../generated/asakusa-train-types.json' with { type: 'json' };
import type { DayKind, Train } from '../types.ts';

const { labels, version } = labelsByEdition;
const byRouteHash: Readonly<Partial<Record<string, Record<DayKind, string>>>> =
  labelsByEdition.byRouteHash;
const checkedSchedules = new WeakMap<Train[], ReadonlyMap<string, string>>();

function trainKey(train: Train) {
  return `${train.time}/${train.dayOffset}/${train.destination}/${train.trainId ?? ''}`;
}

/** Look up the ODPT label only in the exact GTFS schedule it was checked against. */
export function asakusaTrainType(
  edition: VerifiedRouteEdition | null,
  day: DayKind,
  train: Train,
): string | undefined {
  if (!train.gtfs || edition?.gtfs?.version !== version) return;
  const codes = byRouteHash[edition.sha256]?.[day];
  const schedule = edition.schedules[day];
  if (!codes || codes.length !== schedule.length) return;
  let types = checkedSchedules.get(schedule);
  if (!types) {
    const confirmed = new Map<string, string>();
    schedule.forEach((row, index) => {
      const key = trainKey(row);
      const type = labels[Number(codes[index])] ?? '';
      confirmed.set(key, !confirmed.has(key) || confirmed.get(key) === type ? type : '');
    });
    types = confirmed;
    checkedSchedules.set(schedule, types);
  }
  return types.get(trainKey(train)) || undefined;
}
