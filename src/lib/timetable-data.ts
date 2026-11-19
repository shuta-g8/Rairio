import seed from '../../shared/asakusa-timetable-manifest.json' with { type: 'json' };
import {
  canonicalTimetable,
  advanceTimetableManifest,
  editionServiceDate,
  managesTimetable,
  TIMETABLE_MANIFEST_PATH,
  timetableHash,
  validateTimetableManifest,
  verifyEditionAsset,
  type TimetableManifest,
  type VerifiedRouteEdition,
} from '../../shared/timetable-editions.ts';
import { readStoredJson, writeStoredJson } from './storage';
import type { StationData, Route } from '../types';

const initial = validateTimetableManifest(seed);
let latest = initial;
const MANIFEST_STORAGE = 'rairio:asakusa:timetable-manifest:v1';
const payloadCache = new Map<string, string>();
const pending = new Map<string, Promise<string>>();
const rootUrl = () => import.meta.env.BASE_URL;
const validManifest = (v: unknown): v is TimetableManifest => {
  try {
    validateTimetableManifest(v);
    return true;
  } catch {
    return false;
  }
};
function adopt(m: TimetableManifest) {
  latest = advanceTimetableManifest(latest, m);
}
export async function loadTimetableManifest(signal: AbortSignal) {
  const saved = readStoredJson(MANIFEST_STORAGE, validManifest);
  if (saved) {
    try {
      adopt(validateTimetableManifest(saved));
    } catch {
      /* use the compiled/current version */
    }
  }
  try {
    const response = await fetch(rootUrl() + TIMETABLE_MANIFEST_PATH, {
      cache: 'no-store',
      signal: AbortSignal.any([signal, AbortSignal.timeout(6000)]),
    });
    if (!response.ok) throw Error('manifest-http');
    const text = await response.text();
    if (text.length > 100000) throw Error('manifest-budget');
    adopt(validateTimetableManifest(JSON.parse(text)));
    writeStoredJson(MANIFEST_STORAGE, latest);
  } catch (error) {
    if (signal.aborted) throw error;
  }
  return latest;
}
async function loadAsset(path: string, sha256: string, signal: AbortSignal) {
  const key = 'rairio:asakusa:asset:v1:' + sha256;
  let text =
    payloadCache.get(sha256) ??
    readStoredJson(key, (x): x is string => typeof x === 'string' && x.length < 2000000) ??
    undefined;
  if (text && (await timetableHash(text)) !== sha256) text = undefined;
  if (!text) {
    let request = pending.get(sha256);
    if (!request) {
      request = (async () => {
        // Shared immutable request has its own deadline, not the first caller's abort.
        const r = await fetch(rootUrl() + path, {
          cache: 'no-cache',
          signal: AbortSignal.timeout(6000),
        });
        if (!r.ok) throw Error('timetable-asset-http');
        const body = await r.text();
        if (body.length > 2000000 || (await timetableHash(body)) !== sha256)
          throw Error('timetable-asset-integrity');
        payloadCache.set(sha256, body);
        writeStoredJson(key, body);
        while (payloadCache.size > 50) payloadCache.delete(payloadCache.keys().next().value!);
        return body;
      })().finally(() => pending.delete(sha256));
      pending.set(sha256, request);
    }
    text = await request;
  }
  if (signal.aborted) throw signal.reason;
  return text;
}
/** Every path, including localStorage/old SW responses, is reverified. A raw
 * object's self-declared timetableEditions field is never accepted as proof. */
export async function verifyStationTimetables(
  data: StationData,
  signal: AbortSignal,
): Promise<StationData> {
  if (!data.routes.some(managesTimetable)) return data;
  const manifest = await loadTimetableManifest(signal),
    editions = new Map<string, VerifiedRouteEdition[]>();
  const date = editionServiceDate(Date.now());
  await Promise.all(
    manifest.releases
      .filter((r) => r.effectiveToExclusive === null || date < r.effectiveToExclusive)
      .map(async (release) => {
        const ref = release.stations[data.id];
        if (!ref) return;
        let routes: Route[] = [];
        try {
          routes = (await verifyEditionAsset(
            await loadAsset(ref.path, ref.sha256, signal),
            manifest,
            release,
            data.id,
          )) as unknown as Route[];
        } catch (error) {
          if (signal.aborted) throw error;
          // A legacy JSON can supply only the exact reviewed schedule it hashes to.
          for (const route of data.routes.filter(managesTimetable))
            if (
              ref.routeHashes[route.id] &&
              (await timetableHash(canonicalTimetable(route.schedules))) ===
                ref.routeHashes[route.id]
            )
              routes.push(route);
        }
        for (const route of routes) {
          if (
            !data.routes.some(
              (r) => r.id === route.id && r.sourceStationId === route.sourceStationId,
            )
          )
            continue;
          editions.set(route.id, [
            ...(editions.get(route.id) ?? []),
            {
              id: release.id,
              effectiveFrom: release.effectiveFrom,
              effectiveToExclusive: release.effectiveToExclusive,
              sha256: ref.routeHashes[route.id],
              schedules: route.schedules,
              sourceUpdated: route.sourceUpdated,
            },
          ]);
        }
      }),
  );
  if (signal.aborted) throw signal.reason;
  return {
    ...data,
    routes: data.routes.map((route) =>
      managesTimetable(route)
        ? { ...route, timetableEditions: editions.get(route.id) ?? [] }
        : route,
    ),
  };
}
