// Shared by the browser, offline worker (inlined at build), and local tooling.
// The known cutoff is compiled into the app: a stale manifest cannot extend it.
export const ASAKUSA_CUTOVER = '2026-11-21';
export const TIMETABLE_MANIFEST_PATH = 'metadata/asakusa-timetable-editions.json';
export const TIMETABLE_POLICY_VERSION = 1;
export type NaritaVia = 'hokuso' | 'keisei';
export interface GtfsDeparture {
  stopMask: number;
  destinationId?: string;
}
interface GtfsTimetable {
  version: string;
  sha256: string;
  serviceDays: Record<string, 'weekday' | 'saturday' | 'holiday'>;
}
export type EditionSchedules = Record<
  'weekday' | 'saturday' | 'holiday',
  {
    time: string;
    destination: string;
    type: string;
    trainId?: string;
    dayOffset?: number;
    gtfs?: GtfsDeparture;
    naritaVia?: NaritaVia;
  }[]
>;
export interface EditionRoute {
  id: string;
  sourceStationId?: string;
  railwayId?: string;
  line?: string;
  schedules: EditionSchedules;
  [key: string]: unknown;
}
export type TimetableRelease = {
  id: string;
  effectiveFrom: string;
  effectiveToExclusive: string | null;
  reviewedAt: string;
  stations: Record<string, { path: string; sha256: string; routeHashes: Record<string, string> }>;
} & (
  | {
      gtfs?: undefined;
      sourceHashes: { station: string; weekday: string; holiday: string };
      issued: { weekday: string; holiday: string };
    }
  | { gtfs: GtfsTimetable }
);
export interface TimetableManifest {
  version: 1;
  railwayId: 'Asakusa';
  serviceDayStartHourJst: 4;
  generation: number;
  releases: TimetableRelease[];
}
export interface VerifiedRouteEdition {
  id: string;
  effectiveFrom: string;
  effectiveToExclusive: string | null;
  sha256: string;
  schedules: EditionSchedules;
  sourceUpdated?: string;
  gtfs?: GtfsTimetable;
}
export interface EditionAwareRoute {
  id: string;
  railwayId?: string;
  line?: string;
  schedules: EditionSchedules;
  timetableEditions?: VerifiedRouteEdition[];
}
export const editionServiceDate = (at: number) =>
  new Date(at + 5 * 3600000).toISOString().slice(0, 10);
export const managesTimetable = (r: { id?: string; railwayId?: string }) =>
  r.railwayId === 'Asakusa' || r.id?.startsWith('Toei.Asakusa.') === true;
export function canonicalTimetable(value: unknown): string {
  const normalize = (v: any): any =>
    Array.isArray(v)
      ? v.map(normalize)
      : v && typeof v === 'object'
        ? Object.fromEntries(
            Object.keys(v)
              .sort()
              .map((k) => [k, normalize(v[k])]),
          )
        : v;
  return JSON.stringify(normalize(value));
}
export async function timetableHash(text: string): Promise<string> {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(bytes)].map((n) => n.toString(16).padStart(2, '0')).join('');
}
const validEditionDate = (d: unknown): d is string =>
  typeof d === 'string' &&
  /^\d{4}-\d{2}-\d{2}$/.test(d) &&
  new Date(d + 'T00:00:00Z').toISOString().slice(0, 10) === d;
const validEditionHash = (h: unknown): h is string =>
  typeof h === 'string' && /^[a-f0-9]{64}$/.test(h);
function validGtfsRelease(release: TimetableRelease) {
  const { gtfs, effectiveFrom, effectiveToExclusive } = release;
  if (
    !gtfs ||
    !/^\d{8}$/.test(gtfs.version) ||
    !validEditionHash(gtfs.sha256) ||
    !validEditionDate(effectiveToExclusive) ||
    !gtfs.serviceDays ||
    typeof gtfs.serviceDays !== 'object'
  )
    return false;
  const days = Object.entries(gtfs.serviceDays);
  const start = Date.parse(effectiveFrom);
  const length = (Date.parse(effectiveToExclusive) - start) / 86_400_000;
  return (
    length > 0 &&
    length <= 366 &&
    days.length === length &&
    days.every(
      ([date, day]) =>
        validEditionDate(date) &&
        date >= effectiveFrom &&
        date < effectiveToExclusive &&
        ['weekday', 'saturday', 'holiday'].includes(day),
    )
  );
}
export function validateTimetableManifest(value: unknown): TimetableManifest {
  const m = value as TimetableManifest;
  if (
    !m ||
    m.version !== 1 ||
    m.railwayId !== 'Asakusa' ||
    m.serviceDayStartHourJst !== 4 ||
    !Number.isSafeInteger(m.generation) ||
    m.generation < 1 ||
    !Array.isArray(m.releases) ||
    m.releases.length > 2
  )
    throw Error('timetable-manifest-invalid');
  const ids = new Set<string>();
  for (const r of m.releases) {
    if (
      !r ||
      ids.has(r.id) ||
      !validEditionDate(r.effectiveFrom) ||
      !Number.isFinite(Date.parse(r.reviewedAt)) ||
      !r.stations ||
      (r.effectiveFrom < ASAKUSA_CUTOVER
        ? r.id !== 'asakusa-pre-2026-11-21' || r.effectiveToExclusive !== ASAKUSA_CUTOVER
        : r.id !== 'asakusa-2026-11-21' ||
          r.effectiveFrom !== ASAKUSA_CUTOVER ||
          (!r.gtfs && r.effectiveToExclusive !== null)) ||
      (r.gtfs !== undefined
        ? r.effectiveFrom !== ASAKUSA_CUTOVER || !validGtfsRelease(r)
        : !r.sourceHashes ||
          ![r.sourceHashes.station, r.sourceHashes.weekday, r.sourceHashes.holiday].every(
            validEditionHash,
          ) ||
          !r.issued ||
          !validEditionDate(r.issued.weekday) ||
          !validEditionDate(r.issued.holiday) ||
          (r.effectiveFrom >= ASAKUSA_CUTOVER &&
            (r.issued.weekday < ASAKUSA_CUTOVER ||
              r.issued.weekday > '2026-11-24' ||
              r.issued.holiday !== ASAKUSA_CUTOVER)))
    )
      throw Error('timetable-release-unverified');
    ids.add(r.id);
    const entries = Object.entries(r.stations);
    if (!entries.length || entries.length > 30) throw Error('timetable-stations-invalid');
    for (const [id, asset] of entries) {
      if (
        !/^[a-z]+$/.test(id) ||
        !validEditionHash(asset.sha256) ||
        asset.path !== `timetables/asakusa/${asset.sha256}-${id}.json` ||
        !asset.routeHashes ||
        !Object.keys(asset.routeHashes).length ||
        Object.entries(asset.routeHashes).some(
          ([route, h]) => !route.startsWith('Toei.Asakusa.') || !validEditionHash(h),
        )
      )
        throw Error('timetable-asset-invalid');
    }
  }
  return structuredClone(m);
}
export function releaseForDate(m: TimetableManifest, date: string) {
  return (
    m.releases.find(
      (r) =>
        r.effectiveFrom <= date &&
        (r.effectiveToExclusive === null || date < r.effectiveToExclusive),
    ) ?? null
  );
}
export function advanceTimetableManifest(
  current: TimetableManifest,
  value: unknown,
): TimetableManifest {
  const candidate = validateTimetableManifest(value);
  if (candidate.generation < current.generation) return current;
  if (
    candidate.generation === current.generation &&
    canonicalTimetable(candidate) !== canonicalTimetable(current)
  )
    throw Error('timetable-manifest-generation-conflict');
  return candidate;
}
export function timetableEditionForDate(route: EditionAwareRoute, date: string) {
  const expected = date < ASAKUSA_CUTOVER ? 'asakusa-pre-2026-11-21' : 'asakusa-2026-11-21';
  const matches = route.timetableEditions?.filter(
    (e) =>
      e.id === expected &&
      e.effectiveFrom <= date &&
      (e.effectiveToExclusive === null || date < e.effectiveToExclusive) &&
      (date < ASAKUSA_CUTOVER
        ? e.effectiveToExclusive === ASAKUSA_CUTOVER
        : e.effectiveFrom === ASAKUSA_CUTOVER &&
          (e.gtfs ? Object.hasOwn(e.gtfs.serviceDays, date) : e.effectiveToExclusive === null)),
  );
  return matches?.length === 1 ? matches[0] : null;
}
export function schedulesForDate(route: EditionAwareRoute, date: string): EditionSchedules | null {
  if (!managesTimetable(route) || (date < ASAKUSA_CUTOVER && route.timetableEditions === undefined))
    return route.schedules;
  return timetableEditionForDate(route, date)?.schedules ?? null;
}
export async function verifyEditionAsset(
  text: string,
  manifest: TimetableManifest,
  release: TimetableRelease,
  stationId: string,
): Promise<EditionRoute[]> {
  const ref = release.stations[stationId];
  if (
    !ref ||
    text.length > 2_000_000 ||
    (await timetableHash(text)) !== ref.sha256 ||
    !manifest.releases.some((r) => canonicalTimetable(r) === canonicalTimetable(release))
  )
    throw Error('timetable-asset-integrity');
  const asset = JSON.parse(text);
  if (
    asset.version !== 1 ||
    asset.stationId !== stationId ||
    asset.releaseId !== release.id ||
    !Array.isArray(asset.routes) ||
    asset.routes.length !== Object.keys(ref.routeHashes).length
  )
    throw Error('timetable-asset-scope');
  const seen = new Set<string>();
  for (const route of asset.routes) {
    if (
      !managesTimetable(route) ||
      seen.has(route.id) ||
      !ref.routeHashes[route.id] ||
      (await timetableHash(canonicalTimetable(route.schedules))) !== ref.routeHashes[route.id] ||
      !['weekday', 'saturday', 'holiday'].every(
        (day) =>
          Array.isArray(route.schedules?.[day]) &&
          route.schedules[day].length > 0 &&
          route.schedules[day].every(
            (t: EditionSchedules['weekday'][number]) =>
              /^([01]\d|2[0-3]):[0-5]\d$/.test(t.time) &&
              typeof t.destination === 'string' &&
              typeof t.type === 'string' &&
              (t.naritaVia === undefined || t.naritaVia === 'hokuso' || t.naritaVia === 'keisei') &&
              (release.gtfs
                ? t.type === '' &&
                  !!t.gtfs &&
                  Number.isSafeInteger(t.gtfs.stopMask) &&
                  t.gtfs.stopMask > 0 &&
                  t.gtfs.stopMask < 2 ** 20 &&
                  (t.trainId === undefined ||
                    (/^odpt\.Train:Toei\.Asakusa\.\d{3,4}[HKNT][ab]?$/.test(t.trainId) &&
                      typeof t.gtfs.destinationId === 'string' &&
                      /^[A-Za-z0-9]+$/.test(t.gtfs.destinationId)))
                : t.gtfs === undefined),
          ),
      )
    )
      throw Error('timetable-route-integrity');
    seen.add(route.id);
  }
  return asset.routes;
}

export async function verifiedStationEditions(
  stationId: string,
  routes: (EditionAwareRoute & { sourceStationId?: string; sourceUpdated?: string })[],
  manifest: TimetableManifest,
  date: string,
  load: (path: string, hash: string) => Promise<string>,
  signal?: AbortSignal,
) {
  const managed = routes.filter(managesTimetable);
  const entries = await Promise.all(
    manifest.releases
      .filter((release) => !release.effectiveToExclusive || date < release.effectiveToExclusive)
      .map(async (release) => {
        const ref = release.stations[stationId];
        if (!ref) return [];
        let verified: {
          id: string;
          sourceStationId?: string;
          schedules: EditionSchedules;
          sourceUpdated?: unknown;
        }[];
        try {
          verified = await verifyEditionAsset(
            await load(ref.path, ref.sha256),
            manifest,
            release,
            stationId,
          );
        } catch {
          signal?.throwIfAborted();
          verified = [];
          for (const route of managed) {
            if (
              ref.routeHashes[route.id] &&
              (await timetableHash(canonicalTimetable(route.schedules))) ===
                ref.routeHashes[route.id]
            )
              verified.push(route);
          }
        }
        return verified
          .filter((route) =>
            managed.some((r) => r.id === route.id && r.sourceStationId === route.sourceStationId),
          )
          .map(
            (route) =>
              [
                route.id,
                {
                  id: release.id,
                  effectiveFrom: release.effectiveFrom,
                  effectiveToExclusive: release.effectiveToExclusive,
                  sha256: ref.routeHashes[route.id],
                  schedules: route.schedules,
                  sourceUpdated:
                    typeof route.sourceUpdated === 'string' ? route.sourceUpdated : undefined,
                  ...(release.gtfs && { gtfs: release.gtfs }),
                },
              ] as const,
          );
      }),
  );
  signal?.throwIfAborted();
  const editions = new Map<string, VerifiedRouteEdition[]>();
  for (const [id, entry] of entries.flat()) editions.set(id, [...(editions.get(id) ?? []), entry]);
  return editions;
}

/** Sanitize the legacy /data URL for clients controlled by the updated worker.
 * Preserve every other route; never return an expired/unknown Asakusa schedule. */
export async function sanitizeStationTimetables(data: any, m: TimetableManifest, at: number) {
  if (!data || !Array.isArray(data.routes)) throw Error('station-data-invalid');
  const release = releaseForDate(m, editionServiceDate(at)),
    hashes = release?.stations[data.id]?.routeHashes;
  const routes = await Promise.all(
    data.routes.map(async (r: any) => {
      if (!managesTimetable(r)) return r;
      const { timetableEditions: _, ...route } = r;
      if (hashes?.[r.id] && (await timetableHash(canonicalTimetable(r.schedules))) === hashes[r.id])
        return route;
      return {
        ...route,
        schedules: { weekday: [], saturday: [], holiday: [] },
        timetableUnavailable: true,
      };
    }),
  );
  return { ...data, routes };
}
