import type { JourneyData, JourneyLine } from '../../shared/journey.ts';
import type { Journey, JourneyLeg } from './journey.ts';

export interface JourneyRouteStation {
  kind: 'station';
  id: string;
  name: string;
  lines: JourneyLine[];
  arrival?: number;
  departure?: number;
  waitMinutes?: number;
}

export type JourneyRouteRow = JourneyRouteStation | { kind: 'segment'; leg: JourneyLeg };

/** Share a station row for train changes, but keep both sides of an explicit walk. */
export function buildJourneyRouteRows(journey: Journey, data: JourneyData): JourneyRouteRow[] {
  const rows: JourneyRouteRow[] = [];
  let previous: JourneyRouteStation | undefined;
  for (const leg of journey.legs) {
    const from = data.stops[leg.from],
      to = data.stops[leg.to];
    if (!previous || previous.id !== from.station) {
      previous = { kind: 'station', id: from.station, name: from.name, lines: [] };
      rows.push(previous);
    }
    if (leg.kind === 'ride') {
      if (!previous.lines.includes(leg.line)) previous.lines.push(leg.line);
      previous.departure = leg.departure;
      if (previous.arrival !== undefined && previous.waitMinutes === undefined)
        previous.waitMinutes = leg.departure - previous.arrival;
      rows.push({ kind: 'segment', leg });
      previous = {
        kind: 'station',
        id: to.station,
        name: to.name,
        lines: [leg.line],
        arrival: leg.arrival,
      };
      rows.push(previous);
    } else {
      rows.push({ kind: 'segment', leg });
      previous = { kind: 'station', id: to.station, name: to.name, lines: [] };
      rows.push(previous);
    }
  }
  return rows;
}
