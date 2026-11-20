import type { JourneyData } from '../../shared/journey.ts';
import type { Departure, Route, StationData } from '../types.ts';
import type { Journey, JourneyLeg } from './journey.ts';
import { dayKind, departureTimestamp } from './time.ts';
import { schedulesForDate } from '../../shared/timetable-editions.ts';
import { toeiRouteStations } from './toei-stops.ts';

export interface JourneyLcdDeparture {
  route: Route;
  departure: Departure;
  stationName: string;
}
function destinationKey(value: string) {
  const name = value.normalize('NFKC').replace(/\((?:鉄道|京急)\)|\s/g, '');
  return name === '羽田空港第1・第2ターミナル' ? '羽田空港' : name;
}

/** Match the selected trip, not whatever happens to be next at the wall-clock time. */
export function journeyLcdDeparture(
  station: StationData,
  journey: Journey,
  data: JourneyData,
  legIndex = 0,
): JourneyLcdDeparture | undefined {
  const leg = journey.legs[legIndex];
  if (leg?.kind !== 'ride' || data.stops[leg.from]?.station !== station.id) return;
  const trip = data.trips.find((t) => t.id === leg.trip);
  const boarding = trip?.stops.findIndex((s) => s[0] === leg.from && s[2] === leg.departure) ?? -1;
  const nextStation =
    trip && boarding >= 0 ? data.stops[trip.stops[boarding + 1]?.[0]]?.station : undefined;
  if (!nextStation) return;
  const day = dayKind(journey.serviceDate);
  const timestamp = Date.parse(`${journey.serviceDate}T00:00:00+09:00`) + leg.departure * 60000;
  const matches: JourneyLcdDeparture[] = [];
  for (const route of station.routes) {
    if (route.railwayId !== leg.line) continue;
    const order = toeiRouteStations(route);
    const origin = order?.findIndex((s) => s.id === station.id) ?? -1;
    if (!order || origin < 0) continue;
    const next = order.findIndex((s, i) => i > origin && s.id === nextStation);
    if (next < 0 || (leg.line === 'Oedo' && next !== origin + 1)) continue;
    for (const train of schedulesForDate(route, journey.serviceDate)?.[day] || []) {
      if (
        departureTimestamp(journey.serviceDate, train.time, train.dayOffset) !== timestamp ||
        destinationKey(train.destination) !== destinationKey(leg.headsign)
      )
        continue;
      matches.push({
        route,
        stationName: station.name,
        departure: { ...train, timestamp, serviceDate: journey.serviceDate, day },
      });
    }
  }
  return matches.length === 1 ? matches[0] : undefined;
}

/** Each boarding uses that station's timetable and the train selected for that leg. */
export function journeyLcdDepartures(
  stations: ReadonlyMap<string, StationData>,
  journey: Journey,
  data: JourneyData,
): ReadonlyMap<JourneyLeg, JourneyLcdDeparture> {
  const departures = new Map<JourneyLeg, JourneyLcdDeparture>();
  journey.legs.forEach((leg, index) => {
    if (leg.kind !== 'ride') return;
    const station = stations.get(data.stops[leg.from]?.station);
    const lcd = station ? journeyLcdDeparture(station, journey, data, index) : undefined;
    if (lcd) departures.set(leg, lcd);
  });
  return departures;
}
