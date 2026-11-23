import { STATIONS } from '../shared/stations.ts';
import network from '../src/generated/kanto-network.json' with { type: 'json' };
import { servesToeiSurfaceRail } from '../shared/journey-online.ts';

const toeiStations = new Map(STATIONS.map((station) => [station.id, station]));
const kantoStations = new Map(network.stations.map((station) => [station.id, station]));
const toeiLines = new Set(['99301', '99302', '99303', '99304']);

export const stationNameKey = (name) =>
  (typeof name === 'string' ? name : '')
    .normalize('NFKC')
    .replace(/\s/g, '')
    .replace(/\([^()]*\)$/, '')
    .replace(/駅$/, '')
    .toLowerCase();

function station(placeId) {
  if (typeof placeId !== 'string' || placeId.length > 160) return;
  const toei = toeiStations.get(placeId);
  if (toei) {
    const points = (toei.memberships || []).map(({ latitude, longitude }) => ({
      lat: latitude,
      lon: longitude,
    }));
    if (!points.length) return;
    return {
      group: network.toei[placeId] ?? placeId,
      toei: true,
      names: [toei.name, toei.english, toei.sourceName, ...(toei.aliases ?? [])].map(
        stationNameKey,
      ),
      points,
    };
  }
  const match = /^kanto:(\d+)(?::([^:]+))?$/.exec(placeId);
  const entry = match && kantoStations.get(match[1]);
  if (!entry || !entry.lines.some((line) => !toeiLines.has(line))) return;
  const aliases = [...new Set([entry.name, ...entry.names])];
  const selected = match[2]
    ? aliases.find((name) => encodeURIComponent(name) === match[2])
    : entry.name;
  if (!selected) return;
  return {
    group: entry.id,
    toei: servesToeiSurfaceRail(entry.lines),
    names: [selected, ...(selected === entry.name ? entry.english : [])].map(stationNameKey),
    points: [{ lat: entry.lat, lon: entry.lon }],
  };
}

export function stationDistance(a, b) {
  if (![a?.lat, a?.lon, b?.lat, b?.lon].every(Number.isFinite)) return Infinity;
  return Math.hypot((a.lat - b.lat) * 111_000, (a.lon - b.lon) * 90_000);
}

export function resolveJourneyQuery(input) {
  const from = station(input?.from);
  const to = station(input?.to);
  if (!from || !to || from.group === to.group) return;
  if (!from.toei && !to.toei) return;
  const { conventionalOnly = true } = input;
  if (typeof conventionalOnly !== 'boolean') return;
  const time = input.time;
  if (typeof time !== 'string' || !/^20\d{2}-\d\d-\d\dT\d\d:\d\d$/.test(time)) return;
  const timestamp = Date.parse(time + ':00+09:00');
  if (
    !Number.isFinite(timestamp) ||
    new Date(timestamp + 9 * 3_600_000).toISOString().slice(0, 16) !== time
  )
    return;
  return { from, to, time, timestamp, conventionalOnly };
}
