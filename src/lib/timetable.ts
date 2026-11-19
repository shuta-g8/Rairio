import type { Train } from '../types.ts';
import { serviceHour } from './time.ts';

export function groupTimetableByHour(trains: Train[]): Map<number, Train[]> {
  const groups = new Map<number, Train[]>();
  for (const train of trains) {
    const hour = serviceHour(Number(train.time.slice(0, 2)), train.dayOffset);
    const group = groups.get(hour);
    if (group) group.push(train);
    else groups.set(hour, [train]);
  }
  return groups;
}
