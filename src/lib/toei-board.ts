import type { Route } from '../types.ts';
import { STATIONS, STATION_RAILWAYS, lineSymbol } from './stations.ts';
import { destinationDisplayAlias, englishDestination } from './destinations.ts';
import { toeiThroughDestinationCode } from './toei-through-destinations.ts';
import { toeiStationReading } from './toei-language.ts';

const stationsByName = new Map(STATIONS.map((station) => [station.name, station]));
const oedoStations = (STATION_RAILWAYS.find((railway) => railway.id === 'Oedo')?.stations || [])
  .map((station) => ({
    id: station.id,
    number: Number(
      station.memberships?.find((line) => line.railwayId === 'Oedo')?.code.split('-')[1],
    ),
  }))
  .filter((station) => Number.isFinite(station.number))
  .sort((a, b) => a.number - b.number);
const junction = oedoStations.find((station) => station.number === 28);
// The UI catalog deduplicates stations. Restore the loop's E-28 junction visit
// before continuing along E-29 through E-38 toward Hikarigaoka.
const oedoOrder = junction ? [junction.id, ...oedoStations.map((station) => station.id)] : [];

export function toeiBoardDestination(route: Route, destination?: string) {
  const symbol = lineSymbol(route.line);
  const terminal = symbol !== 'E' && destination !== undefined;
  const names = terminal ? [destination] : route.direction.split('・');
  let via = false;
  const origin = route.sourceStationId?.split('.').at(-1)?.toLowerCase();
  const terminalStation = destination === undefined ? undefined : stationsByName.get(destination);
  // Never infer a via station that lies beyond a short-turn train's terminus.
  if (symbol === 'E' && origin && terminalStation && /\.(InnerLoop|OuterLoop)$/.test(route.id)) {
    const order = route.id.endsWith('.InnerLoop') ? [...oedoOrder].reverse() : oedoOrder;
    const start = order.indexOf(origin);
    const end = order.findIndex((id, index) => index > start && id === terminalStation.id);
    const anchor = stationsByName.get(names[0]);
    via = start >= 0 && end > start && !!anchor && order.slice(start + 1, end).includes(anchor.id);
    if (via) names.splice(1, names.length - 1, terminalStation.name);
  }
  const stations = names.map((name) => {
    const station = stationsByName.get(name);
    const membership = station?.memberships?.find((line) =>
      route.railwayId ? line.railwayId === route.railwayId : line.code.startsWith(`${symbol}-`),
    );
    const displayName = destinationDisplayAlias(name).replace(/\((?:鉄道|京急)\)/g, '');
    return {
      name: displayName,
      code: membership?.code ?? (terminal ? toeiThroughDestinationCode(route, name) : undefined),
      reading: station?.reading ?? toeiStationReading(displayName),
      english: station?.english || englishDestination(name),
    };
  });
  return { stations, via, terminal };
}
