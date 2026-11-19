import { JOURNEY_LINES } from '../../shared/journey.ts';
import type { GuidanceConnection } from './journey-guidance.ts';
import type { RankedJourney } from './journey-ranking.ts';
import { STATIONS } from './stations.ts';

const connectionLineIds = new Map<string, string>();
for (const station of STATIONS)
  for (const line of station.availableRailways ?? [])
    if (!connectionLineIds.has(line.name)) connectionLineIds.set(line.name, line.id);

export function guidanceLineId(connection: GuidanceConnection) {
  return connection.line === 'JR山手線'
    ? 'JR-East.Yamanote'
    : connectionLineIds.get(connection.line);
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
