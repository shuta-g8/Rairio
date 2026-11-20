import { JOURNEY_LINES } from '../../shared/journey.ts';
import type { GuidanceConnection } from './journey-guidance.ts';
import type { RankedJourney } from './journey-ranking.ts';
import { STATIONS } from './stations.ts';
import { NETWORK_LINES } from './kanto-network.ts';
import { RAILWAY_SYMBOLS } from './railway-symbols.ts';
import type { OnlineJourneyLeg } from '../../shared/journey-online.ts';

const lineNameKey = (name: string) => name.normalize('NFKC').replace(/\s/g, '');
const connectionLineIds = new Map<string, string>([
  ['JR成田エクスプレス', 'JR-East.NaritaExpress'],
  ['成田エクスプレス', 'JR-East.NaritaExpress'],
]);
for (const station of STATIONS)
  for (const line of station.availableRailways ?? []) {
    const key = lineNameKey(line.name);
    if (!connectionLineIds.has(key)) connectionLineIds.set(key, line.id);
  }

export function guidanceLineId(connection: GuidanceConnection) {
  return connection.line === 'JR山手線'
    ? 'JR-East.Yamanote'
    : connectionLineIds.get(lineNameKey(connection.line));
}

export function onlineJourneyLineId(leg: OnlineJourneyLeg) {
  const railwayId = leg.toeiLine ? `Toei.${leg.toeiLine}` : leg.railwayId;
  if (railwayId && Object.hasOwn(RAILWAY_SYMBOLS, railwayId)) return railwayId;
  const key = lineNameKey(leg.line);
  const direct = connectionLineIds.get(key);
  if (direct) return direct;
  const lines = [...NETWORK_LINES.values()].filter((line) => lineNameKey(line.name) === key);
  return lines.length === 1 ? `network:${lines[0].id}` : 'unknown';
}

export function journeyResultLines(result: RankedJourney, inbound: boolean) {
  const toei =
    result.journey?.legs.flatMap((leg) =>
      leg.kind === 'ride'
        ? [{ id: `Toei.${leg.line}`, name: JOURNEY_LINES[leg.line].name, external: false }]
        : [],
    ) ?? [];
  const connection = result.guidance;
  const other = connection?.segments?.length
    ? connection.segments.map((segment) => ({
        id: `network:${segment.lineId}`,
        name: segment.line,
        external: true,
      }))
    : connection
      ? [{ id: guidanceLineId(connection) ?? 'unknown', name: connection.line, external: true }]
      : [];
  const ordered = inbound ? [...other, ...toei] : [...toei, ...other];
  return [...new Map(ordered.map((line) => [line.id, line])).values()];
}
