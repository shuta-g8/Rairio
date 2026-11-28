import type { Route, Train } from '../types.ts';
import { STATION_RAILWAYS } from './stations.ts';
import { toeiThroughDestinationCode } from './toei-through-destinations.ts';

export interface ToeiStop {
  id: string;
  name: string;
  code: string;
  kind: 'current' | 'stop' | 'pass' | 'past';
  routeStart?: boolean;
}
export interface ToeiStopGuide {
  stations: ToeiStop[];
  through: boolean;
  preceding: ToeiStop[];
  meguroLocalSection?: ToeiMeguroLocalSection;
}

export interface ToeiMeguroLocalSection {
  destination: string;
  code: string;
  intermediateStops: number;
}

// Scheduled stopping patterns, not real-time train positions.
// https://www.kotsu.metro.tokyo.jp/subway/map/index.html
// https://www.kotsu.metro.tokyo.jp/about/koukai/vehicle_outline/asakusa_5500_announce.pdf
// https://www.kotsu.metro.tokyo.jp/pickup_information/news/subway/2021/sub_i_202102059553_h.html
const airportStops = new Set([7, 8, 9, 10, 13, 15, 18, 20]);
const expressStops = new Set([1, 4, 6, 9, 11, 15, 17, 21]);
const localTypes = new Set(['普通', '各駅停車', '各停']);
const asakusaTypes = new Set([
  ...localTypes,
  'アクセス特急',
  '快速',
  '特急',
  '通勤特急',
  '快特',
  '快速特急',
  '急行',
  'エアポート快特',
]);
// Immutable fetched routes can be collected when their station is no longer displayed.
const routeOrders = new WeakMap<Route, ReturnType<typeof orderedRouteStations>>();
const branchPositionOrders = new WeakMap<Route, ReturnType<typeof orderedRouteStations>>();

/** Station order in the direction of travel, independent of a train's destination. */
export function toeiRouteStations(route: Route) {
  if (!routeOrders.has(route)) routeOrders.set(route, orderedRouteStations(route));
  return routeOrders.get(route);
}

export function isTochomaeBranchBoard(route: Route) {
  return (
    route.id === 'Toei.Oedo.Toei.Hikarigaoka' &&
    route.sourceStationId === 'odpt.Station:Toei.Oedo.Tochomae'
  );
}

/** Through-running trains reach the Hikarigaoka board on their second visit to Tochomae.
 * The published branch stop diagram still begins at Tochomae. */
export function toeiPositionStations(route: Route) {
  if (!isTochomaeBranchBoard(route)) return toeiRouteStations(route);
  if (!branchPositionOrders.has(route))
    branchPositionOrders.set(route, orderedRouteStations(route, 'OuterLoop'));
  return branchPositionOrders.get(route);
}

const departureVisits = new WeakMap<Route, number>();

/** The two outward departures at Tochomae belong to distinct visits of the same run. */
export function toeiDepartureVisit(route: Route) {
  const cached = departureVisits.get(route);
  if (cached !== undefined) return cached;
  const order = toeiPositionStations(route);
  const source = route.sourceStationId?.split('.').at(-1)?.toLowerCase();
  const visits = order?.flatMap((s, i) => (s.id === source ? [i] : []));
  const start = (isTochomaeBranchBoard(route) ? visits?.at(-1) : visits?.[0]) ?? -1;
  departureVisits.set(route, start);
  return start;
}

function orderedRouteStations(
  route: Route,
  direction = route.id.replace(`Toei.${route.railwayId}.`, ''),
) {
  const railway = STATION_RAILWAYS.find((line) => line.id === route.railwayId);
  if (!railway || !route.sourceStationId?.startsWith(`odpt.Station:Toei.${railway.id}.`)) return;
  const ordered = railway.stations
    .map((station) => {
      const code = station.memberships!.find((member) => member.railwayId === railway.id)!.code;
      return { id: station.id, name: station.name, code, number: Number(code.split('-')[1]) };
    })
    .sort((a, b) => a.number - b.number);
  let order = ordered;
  if (railway.id === 'Oedo') {
    // E-28 is visited at both ends of the loop, then E-29…E-38 form the branch.
    const junction = ordered.find((station) => station.number === 28)!;
    order = [junction, ...ordered];
    if (direction === 'InnerLoop') order = [...order].reverse();
    else if (direction === 'Toei.Hikarigaoka')
      order = ordered.filter((station) => station.number >= 28);
    else if (direction !== 'OuterLoop') return;
  } else if (['Southbound', 'Westbound'].includes(direction)) order = [...order].reverse();
  else if (!(railway.id === 'Shinjuku' ? direction === 'Eastbound' : direction === 'Northbound'))
    return;

  return order;
}

/** Return nothing when the route, destination or stopping pattern cannot be established. */
export function toeiStopGuide(
  route: Route,
  train: Pick<Train, 'destination' | 'type' | 'gtfs'>,
): ToeiStopGuide | undefined {
  const order = toeiRouteStations(route);
  if (!order) return;
  const railwayId = route.railwayId!;
  const direction = route.id.replace(`Toei.${route.railwayId}.`, '');
  const local = localTypes.has(train.type);
  if (
    railwayId === 'Asakusa'
      ? !train.gtfs && !asakusaTypes.has(train.type)
      : railwayId === 'Oedo'
        ? !local
        : !local && train.type !== '急行'
  )
    return;
  const origin = route.sourceStationId!.split('.').at(-1)!.toLowerCase();
  const start = order.findIndex((station) => station.id === origin);
  if (start < 0) return;
  const throughCode = toeiThroughDestinationCode(route, train.destination);
  const through = throughCode !== undefined;
  // The Toei timetable distinguishes locals from expresses on the Meguro Line.
  // https://www.kotsu.metro.tokyo.jp/subway/timetable/mita/I04SD.html
  // Its first Tokyu stop is MG-02, and the destination code gives the number of omitted stops.
  const meguroLocalSection =
    railwayId === 'Mita' && local && throughCode?.startsWith('MG-')
      ? {
          destination: train.destination,
          code: throughCode,
          intermediateStops: Number(throughCode.slice(3)) - 3,
        }
      : undefined;
  const boundary =
    railwayId === 'Asakusa' && direction === 'Southbound' ? '泉岳寺' : order.at(-1)!.name;
  const gtfsMask = train.gtfs?.stopMask;
  const gtfsStops = (station: (typeof order)[number]) =>
    gtfsMask !== undefined && !!(gtfsMask & (1 << (station.number - 1)));
  const end =
    gtfsMask === undefined
      ? order.findIndex(
          (station, index) =>
            index > start && station.name === (through ? boundary : train.destination),
        )
      : order.reduce((last, station, index) => (gtfsStops(station) ? index : last), -1);
  if (end <= start) return;
  const stops =
    gtfsMask === undefined && railwayId === 'Asakusa' && train.type === 'エアポート快特'
      ? airportStops
      : railwayId === 'Shinjuku' && train.type === '急行'
        ? expressStops
        : undefined;
  // A departure from a normally passed station needs train-specific evidence.
  if (
    (gtfsMask !== undefined && !gtfsStops(order[start])) ||
    (stops && (!stops.has(order[start].number) || !stops.has(order[end].number)))
  )
    return;
  const precedingStart = Math.max(0, start - 3);
  return {
    through,
    meguroLocalSection,
    preceding: order.slice(precedingStart, start).map((station, index) => ({
      id: station.id,
      name: station.name,
      code: station.code,
      kind: 'past',
      routeStart: (precedingStart === 0 && index === 0) || undefined,
    })),
    stations: order.slice(start, end + 1).map((station, index) => ({
      id: station.id,
      name: station.name,
      code: station.code,
      routeStart: (start === 0 && index === 0) || undefined,
      kind:
        index === 0
          ? 'current'
          : (gtfsMask === undefined ? !stops || stops.has(station.number) : gtfsStops(station))
            ? 'stop'
            : 'pass',
    })),
  };
}
