import type { StationData } from '../types.ts';
import { canonicalTimetable } from '../../shared/timetable-editions.ts';

/** Keep live observation sessions when a refresh only replaces JSON objects.
 * Compare the complete verified route, including edition scope and validity;
 * changed schedules or editions must still invalidate the old session. */
export function reuseUnchangedRoutes(previous: StationData | null, next: StationData): StationData {
  if (previous?.id !== next.id) return next;
  const routes = new Map(previous.routes.map((route) => [route.id, route]));
  return {
    ...next,
    routes: next.routes.map((route) => {
      const saved = routes.get(route.id);
      return saved && canonicalTimetable(saved) === canonicalTimetable(route) ? saved : route;
    }),
  };
}
