import seed from '../../shared/asakusa-timetable-manifest.json' with { type: 'json' };
import { DEPARTURE_BOARD_MAX_BYTES, isStationBoardPlan } from '../../shared/departure-board.ts';
import { RAILWAYS } from '../../shared/railways.ts';
import { securityHeaders } from '../../shared/security-headers.mjs';
import {
  advanceTimetableManifest,
  editionServiceDate,
  managesTimetable,
  TIMETABLE_MANIFEST_PATH,
  validateTimetableManifest,
  verifiedStationEditions,
} from '../../shared/timetable-editions.ts';
import { TIMETABLE_SOURCE, TOEI_OPERATOR } from '../../shared/transit-source.ts';

const headers = { ...securityHeaders, 'Cache-Control': 'no-store' };
const initialManifest = validateTimetableManifest(seed);
const railwayIds = new Set(RAILWAYS.map(({ id }) => id));
const stations = new Map();

async function readText(assets, url, path, max, signal) {
  const response = await assets.fetch(new Request(new URL(`/${path}`, url), { signal }));
  if (!response.ok || Number(response.headers.get('content-length')) > max)
    throw Error('station-asset');
  const body = await response.text();
  if (body.length > max) throw Error('station-asset-budget');
  return body;
}

async function readRoutes(assets, url, stationId, date) {
  const signal = AbortSignal.timeout(3500);
  const read = (path, max = 2_000_000) => readText(assets, url, path, max, signal);
  const data = JSON.parse(await read(`data/${stationId}.json`));
  if (
    data.id !== stationId ||
    data.sourceId !== TOEI_OPERATOR ||
    data.sourceUrl !== TIMETABLE_SOURCE ||
    !Array.isArray(data.routes) ||
    data.routes.length < 1 ||
    data.routes.length > 8
  )
    throw Error('station-asset-scope');
  const routes = data.routes.filter(
    (r) =>
      railwayIds.has(r.railwayId) &&
      r.id?.startsWith(`Toei.${r.railwayId}.`) &&
      r.sourceStationId?.startsWith(`odpt.Station:Toei.${r.railwayId}.`),
  );
  if (!routes.some(managesTimetable)) return routes;
  let manifest = initialManifest;
  try {
    manifest = advanceTimetableManifest(
      initialManifest,
      JSON.parse(await read(TIMETABLE_MANIFEST_PATH, 100_000)),
    );
  } catch {
    signal.throwIfAborted();
  }
  const editions = await verifiedStationEditions(
    stationId,
    routes,
    manifest,
    date,
    (path) => read(path),
    signal,
  );
  return routes.flatMap((route) => {
    if (!managesTimetable(route)) return [route];
    const timetableEditions = editions.get(route.id);
    return timetableEditions
      ? [{ ...route, timetableUnavailable: undefined, timetableEditions }]
      : [];
  });
}

async function stationRoutes(assets, url, stationId, at) {
  const date = editionServiceDate(at);
  const existing = stations.get(stationId);
  if (existing?.date === date && existing.expires > at) return existing.value;
  const value = await readRoutes(assets, url, stationId, date);
  stations.delete(stationId);
  stations.set(stationId, { date, expires: at + 5 * 60_000, value });
  if (stations.size > 24) stations.delete(stations.keys().next().value);
  return value;
}

export async function onRequest({ request, env }) {
  const url = new URL(request.url);
  const stationId = url.searchParams.get('station');
  if (request.method !== 'GET')
    return Response.json(
      { error: 'GET only' },
      { status: 405, headers: { ...headers, Allow: 'GET' } },
    );
  if (!stationId || !/^[a-z]{1,40}$/.test(stationId) || url.searchParams.size !== 1)
    return Response.json({ error: 'Invalid station' }, { status: 400, headers });
  if (!env?.ASSETS || !env.DISPLAY_POSITIONS || env.POSITION_DISPLAY_MODE === 'legacy')
    return Response.json({ error: 'Board unavailable' }, { status: 503, headers });
  try {
    const routes = await stationRoutes(env.ASSETS, url, stationId, Date.now());
    if (!routes.length)
      return Response.json({ error: 'Board unavailable' }, { status: 404, headers });
    const response = await env.DISPLAY_POSITIONS.fetch('https://reader.invalid/departure-board', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stationId, routes }),
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok || Number(response.headers.get('content-length')) > DEPARTURE_BOARD_MAX_BYTES)
      throw Error('board-http');
    const body = await response.text();
    if (body.length > DEPARTURE_BOARD_MAX_BYTES || !isStationBoardPlan(JSON.parse(body), stationId))
      throw Error('board-scope');
    return new Response(body, { headers: { ...headers, 'Content-Type': 'application/json' } });
  } catch {
    return Response.json({ error: 'Board unavailable' }, { status: 503, headers });
  }
}
