import type { Departure, Route, Train } from '../types.ts';
import { timetableEditionForDate, type NaritaVia } from '../../shared/timetable-editions.ts';
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

const naritaViaNames = {
  hokuso: { name: '北総線', reading: 'ほくそうせん', english: 'Hokuso Line', code: undefined },
  keisei: { name: '京成線', reading: 'けいせいせん', english: 'Keisei Line', code: undefined },
};

// ODPT TrainTimetable viaRailway for the verified November 2026 Asakusa edition.
// The Tokyo timetable distinguishes Airport Rapid trains by their type after Oshiage.
const naritaAirportRapidHokuso = {
  weekday: new Set([
    '901K',
    '1011K',
    '1119T',
    '1129T',
    '1203K',
    '1301K',
    '1343T',
    '1449T',
    '1519T',
  ]),
  holiday: new Set([
    '969H',
    '1001K',
    '1103K',
    '1105K',
    '1207K',
    '1379H',
    '1369H',
    '1401K',
    '1503K',
    '1505K',
    '1607K',
    '1771H',
    '1769H',
    '1801K',
  ]),
};
const naritaAirportRapidKeisei = new Set(['2071K', '2175K']);
const naritaKeiseiTypes = new Set(['快速', '通勤特急', '特急', '快特', '快速特急']);
type DestinationTrain = Pick<Train, 'type' | 'trainId' | 'naritaVia'> &
  Partial<Pick<Departure, 'serviceDate' | 'day'>>;

function naritaViaForTrain(route: Route, train?: DestinationTrain): NaritaVia | undefined {
  if (!train) return;
  if (train.naritaVia) return train.naritaVia;
  if (train.type === 'アクセス特急') return 'hokuso';
  if (naritaKeiseiTypes.has(train.type)) return 'keisei';
  if (train.type !== 'エアポート快特' || !train.serviceDate || !train.day) return;
  const edition = timetableEditionForDate(route, train.serviceDate);
  if (edition?.id !== 'asakusa-2026-11-21' || edition.gtfs) return;
  const number = train.trainId?.match(/^odpt\.Train:Toei\.Asakusa\.(\d{3,4}[HKNT][ab]?)$/)?.[1];
  if (!number) return;
  const weekday = train.day === 'weekday';
  if (weekday && naritaAirportRapidKeisei.has(number)) return 'keisei';
  if (naritaAirportRapidHokuso[weekday ? 'weekday' : 'holiday'].has(number)) return 'hokuso';
}

export function toeiBoardDestination(route: Route, destination?: string, train?: DestinationTrain) {
  const symbol = lineSymbol(route.line);
  const terminal = symbol !== 'E' && destination !== undefined;
  const viaRailway =
    route.id === 'Toei.Asakusa.Northbound' && destination === '成田空港(鉄道)'
      ? naritaViaForTrain(route, train)
      : undefined;
  const names = terminal ? [destination] : route.direction.split('・');
  let via = viaRailway !== undefined;
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
  if (viaRailway) stations.unshift(naritaViaNames[viaRailway]);
  return { stations, via, terminal, viaRailway };
}
