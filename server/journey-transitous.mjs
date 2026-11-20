import { stationDistance, stationNameKey } from './journey-stations.mjs';
import { JOURNEY_LINES } from '../shared/journey.ts';

export const transitousSource = 'https://api.transitous.org/api/v6/plan';
const conventionalRailModes = 'SUBWAY,SUBURBAN,REGIONAL_RAIL,LONG_DISTANCE,NIGHT_RAIL,TRAM';
const endpointRadius = 750;
const odptLineNames = new Map(
  Object.entries(JOURNEY_LINES).map(([id, { name }]) => [name.replace(/^都営/, ''), id]),
);

export function japaneseLabel(value) {
  const name = typeof value === 'string' ? value.trim().slice(0, 100) : '';
  return /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u.test(name)
    ? name.replace(/\s+[A-Za-zÀ-ž].*$/, '')
    : name;
}

function namedLabel(value) {
  const name = japaneseLabel(value);
  return /\p{L}/u.test(name) ? name : undefined;
}

function sameStation(place, station) {
  return (
    station.names.includes(stationNameKey(japaneseLabel(place.name))) &&
    station.points.some((point) => stationDistance(point, place) <= endpointRadius)
  );
}

function ridePlace(place) {
  const name = japaneseLabel(place?.name);
  if (!name || ![place.lat, place.lon].every(Number.isFinite)) return;
  return { name, lat: place.lat, lon: place.lon, stopId: place.stopId };
}

function stopCode(value) {
  if (typeof value !== 'string') return;
  const match = /^([A-Z]{1,3})[\s-]*(\d{1,3})$/.exec(value.trim().normalize('NFKC').toUpperCase());
  return match ? `${match[1]}-${match[2]}` : undefined;
}

function candidate(itinerary, query, id) {
  if (!Array.isArray(itinerary?.legs) || itinerary.legs.length > 24) return;
  const legs = [];
  const rides = [];
  for (const leg of itinerary.legs) {
    const from = ridePlace(leg?.from);
    const to = ridePlace(leg?.to);
    const start = Date.parse(leg?.startTime);
    const end = Date.parse(leg?.endTime);
    if (
      !from ||
      !to ||
      !Number.isFinite(start) ||
      !Number.isFinite(end) ||
      start > end ||
      leg.cancelled
    )
      return;
    const walk = leg.mode === 'WALK';
    if (!walk && typeof leg.routeId !== 'string') return;
    if (
      query.conventionalOnly &&
      (leg.mode === 'HIGHSPEED_RAIL' ||
        leg.routeType === 101 ||
        /新幹線|shinkansen/i.test(`${leg.routeLongName ?? ''} ${leg.routeShortName ?? ''}`))
    )
      return;
    const label = namedLabel(leg.routeLongName) ?? namedLabel(leg.routeShortName);
    // Transitous carries both the Tokyo Rail feed and the bureau's own ODPT feed.
    const odpt = leg.agencyId === 'toei' && /^jp-Toei-Train_/.test(leg.routeId ?? '');
    const toeiLine =
      /(?:^|_)Toei\.(Asakusa|Mita|Shinjuku|Oedo)$/.exec(leg.routeId ?? '')?.[1] ??
      (odpt ? odptLineNames.get(label?.replace(/^都営/, '')) : undefined);
    const toei = Boolean(toeiLine) || /(?:^|_)Toei\./.test(leg.routeId ?? '');
    const namedLine = toeiLine ? JOURNEY_LINES[toeiLine].name : label;
    const agency = namedLabel(leg.agencyName);
    const line = walk
      ? '徒歩'
      : (namedLine ?? (agency ? `${agency}（路線名未収録）` : '路線名未収録'));
    const railwayId = toeiLine
      ? `Toei.${toeiLine}`
      : /^(?:jp-tokyo-rail_)?([\w-]+\.[\w-]+)$/.exec(leg.routeId ?? '')?.[1];
    const fromCode = walk ? undefined : stopCode(leg.from.stopCode);
    const toCode = walk ? undefined : stopCode(leg.to.stopCode);
    const headsign =
      toeiLine && typeof leg.headsign === 'string'
        ? namedLabel(leg.headsign.replace(/^\([^()]+\)\s*/, ''))
        : undefined;
    const routeColor =
      !walk &&
      namedLine &&
      typeof leg.routeColor === 'string' &&
      /^#?[0-9a-f]{6}$/i.test(leg.routeColor)
        ? '#' + leg.routeColor.replace(/^#/, '').toLowerCase()
        : undefined;
    const previous = rides.at(-1);
    const through = !walk && leg.interlineWithPreviousLeg === true;
    // The feed sometimes splits the same train on the same line into successive legs.
    if (
      through &&
      previous?.routeId === leg.routeId &&
      previous.to.stopId === from.stopId &&
      legs.at(-1) === previous.display
    ) {
      previous.to = to;
      previous.display.to = to.name;
      previous.display.toCode = toCode;
      previous.display.end = end;
      continue;
    }
    const display = {
      line,
      headsign,
      routeColor,
      railwayId,
      from: from.name,
      to: to.name,
      fromCode,
      toCode,
      start,
      end,
      toei,
      toeiLine,
      through,
      walk,
    };
    legs.push(display);
    if (!walk) rides.push({ from, to, line: namedLine, routeId: leg.routeId, through, display });
  }
  const first = rides[0];
  const last = rides.at(-1);
  if (!first || !sameStation(first.from, query.from) || !sameStation(last.to, query.to)) return;
  const transfers = itinerary.transfers;
  if (!Number.isInteger(transfers) || transfers < 0 || transfers >= rides.length) return;
  // Coordinate access and egress are search aids. The user selected the stations themselves.
  const stationLegs = legs.slice(legs.indexOf(first.display), legs.indexOf(last.display) + 1);
  const { start } = first.display;
  const { end } = last.display;
  if (start < query.timestamp || start > end) return;
  return {
    route: { id, start, end, transfers, legs: stationLegs },
    fare:
      !first.through &&
      rides.every((ride) => ride.line) &&
      transfers === rides.slice(1).filter((ride) => !ride.through).length
        ? {
            id,
            transfers,
            rides: rides.map(({ from, to, line, routeId, through }) => ({
              from,
              to,
              line,
              routeId,
              through,
            })),
          }
        : undefined,
  };
}

export function transitousResults(data, query) {
  const candidates = [];
  const seen = new Set();
  for (const itinerary of data.itineraries.slice(0, 20)) {
    const item = candidate(itinerary, query, candidates.length + 1);
    if (!item) continue;
    const key = JSON.stringify(item.route.legs, (property, value) =>
      ['fromCode', 'toCode', 'headsign', 'routeColor'].includes(property) ? undefined : value,
    );
    if (seen.has(key)) continue;
    seen.add(key);
    candidates.push(item);
    if (candidates.length === 6) break;
  }
  return candidates;
}

export function transitousPlanUrl(query) {
  const position = ({ lat, lon }) => `${lat.toFixed(5)},${lon.toFixed(5)}`;
  const url = new URL(transitousSource);
  url.search = new URLSearchParams({
    fromPlace: position(query.from.points[0]),
    toPlace: position(query.to.points[0]),
    time: query.time + ':00+09:00',
    radius: String(endpointRadius),
    transitModes: query.conventionalOnly ? conventionalRailModes : 'RAIL,TRAM',
    joinInterlinedLegs: 'false',
    numItineraries: '6',
    withFares: 'false',
    detailedLegs: 'false',
  });
  return url;
}
