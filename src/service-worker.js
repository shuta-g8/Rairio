/* This template is finalized with a content hash and build URLs by build/offline.ts. */
const PRECACHE = __PRECACHE_URLS__;
const BASE = __BASE_PATH__;
const CACHE_PREFIX = `kanto-offline-${encodeURIComponent(BASE)}-`;
const CACHE_NAME = `${CACHE_PREFIX}__CACHE_VERSION__`;
// Build inlines the same policy used by the app, without another script fetch.
__TIMETABLE_POLICY__;
let timetableManifest = validateTimetableManifest(__INITIAL_TIMETABLE_MANIFEST__);
function adoptManifest(value) {
  timetableManifest = advanceTimetableManifest(timetableManifest, value);
}
async function cachedManifest(cache) {
  try {
    const response = await cache.match(BASE + TIMETABLE_MANIFEST_PATH);
    if (response) adoptManifest(await response.json());
  } catch {
    /* compiled cutoff still applies */
  }
}
async function removeExpiredTimetableAssets(cache) {
  const date = editionServiceDate(Date.now());
  for (const release of timetableManifest.releases)
    if (release.effectiveToExclusive !== null && date >= release.effectiveToExclusive)
      for (const asset of Object.values(release.stations)) await cache.delete(BASE + asset.path);
}
async function safeStationResponse(response) {
  const original = await response.json();
  if (!Array.isArray(original?.routes))
    return new Response(JSON.stringify(original), {
      headers: { 'Content-Type': 'application/json' },
    });
  let at = Date.now();
  let data = await sanitizeStationTimetables(original, timetableManifest, at);
  if (editionServiceDate(at) !== editionServiceDate(Date.now())) {
    at = Date.now();
    data = await sanitizeStationTimetables(data, timetableManifest, at);
  }
  return new Response(JSON.stringify(data), {
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}
async function timetableManifestResponse(request, cache) {
  await cachedManifest(cache);
  try {
    const response = await fetch(request, { cache: 'no-store', signal: AbortSignal.timeout(5000) });
    if (!response.ok) throw Error('manifest-http');
    const text = await response.text();
    if (text.length > 100000) throw Error('manifest-budget');
    adoptManifest(JSON.parse(text));
  } catch {
    /* a cached manifest never extends the compiled old-edition expiry */
  }
  const result = new Response(JSON.stringify(timetableManifest), {
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
  await cache.put(BASE + TIMETABLE_MANIFEST_PATH, result.clone());
  await removeExpiredTimetableAssets(cache);
  return result;
}
async function timetableAssetResponse(request, cache) {
  await cachedManifest(cache);
  const pathname = new URL(request.url).pathname;
  const release = timetableManifest.releases.find((r) =>
    Object.values(r.stations).some((s) => BASE + s.path === pathname),
  );
  if (
    !release ||
    (release.effectiveToExclusive !== null &&
      editionServiceDate(Date.now()) >= release.effectiveToExclusive)
  ) {
    await cache.delete(request, { ignoreSearch: true });
    return new Response('Timetable edition unavailable', { status: 410 });
  }
  const [stationId] = Object.entries(release.stations).find(([, s]) => BASE + s.path === pathname);
  let response = await cache.match(pathname);
  try {
    if (!response) response = await fetch(request, { signal: AbortSignal.timeout(5000) });
    if (!response?.ok) throw Error('asset-http');
    const text = await response.text();
    await verifyEditionAsset(text, timetableManifest, release, stationId);
    // Recheck after I/O: a request started before 04:00 may finish afterwards.
    if (
      release.effectiveToExclusive !== null &&
      editionServiceDate(Date.now()) >= release.effectiveToExclusive
    )
      throw Error('asset-expired');
    const verified = new Response(text, { headers: { 'Content-Type': 'application/json' } });
    await cache.put(pathname, verified.clone());
    return verified;
  } catch {
    await cache.delete(pathname);
    return new Response('Timetable edition unavailable', { status: 503 });
  }
}
self.addEventListener('message', (event) => {
  if (event.data?.type === 'ACTIVATE_TIMETABLE_WORKER') void self.skipWaiting();
});

async function stageAsset(cache, url, previousCaches) {
  const path = new URL(url, self.location.origin).pathname.slice(BASE.length);
  // Content-hashed files are immutable. Reuse their exact cached responses across
  // worker versions; the shell and timetable data always come from the network.
  if (/^assets\/[^/]+-[\w-]{8}\.[^/]+$/.test(path)) {
    for (const previousCache of previousCaches) {
      const saved = await previousCache.match(url);
      if (saved?.ok) {
        await cache.put(url, saved);
        return;
      }
    }
  }
  await cache.add(new Request(url, { cache: 'reload' }));
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const previousCaches = await Promise.all(
        (await caches.keys())
          .filter((name) => name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME)
          .map((name) => caches.open(name)),
      );
      const cache = await caches.open(CACHE_NAME);
      // Stage the shell, font subsets used by the built app, and every station.
      for (let index = 0; index < PRECACHE.length; index += 20) {
        await Promise.all(
          PRECACHE.slice(index, index + 20).map((url) => stageAsset(cache, url, previousCaches)),
        );
      }
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const previous = (await caches.keys()).filter(
        (name) => name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME,
      );
      for (const name of await caches.keys()) {
        if (name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME) await caches.delete(name);
      }
      await self.clients.claim();
      const cache = await caches.open(CACHE_NAME);
      await cachedManifest(cache);
      await removeExpiredTimetableAssets(cache);
      // Old JS does not know the new safety protocol. Reload controlled tabs
      // only on an update, after the new shell/assets have fully installed.
      if (previous.length)
        for (const client of await self.clients.matchAll({
          type: 'window',
          includeUncontrolled: true,
        })) {
          if (
            new URL(client.url).origin === self.location.origin &&
            new URL(client.url).pathname.startsWith(BASE)
          ) {
            // Awaiting navigation here deadlocks: its fetch may wait for this
            // activation event to finish. Initiate it, then complete activation.
            void client
              .navigate(client.url)
              .catch(() => client.postMessage({ type: 'TIMETABLE_RELOAD_REQUIRED' }));
          }
        }
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (
    request.method !== 'GET' ||
    url.origin !== self.location.origin ||
    !url.pathname.startsWith(BASE)
  )
    return;
  // Live operations NEVER fall back silently to an old "normal service" HTTP response.
  // The app explicitly labels its last successful operations snapshot with a timestamp.
  if (url.pathname.startsWith(`${BASE}api/`)) return;
  if (url.pathname === BASE + TIMETABLE_MANIFEST_PATH) {
    event.respondWith(
      (async () => timetableManifestResponse(request, await caches.open(CACHE_NAME)))(),
    );
    return;
  }
  if (url.pathname.startsWith(BASE + 'timetables/asakusa/')) {
    event.respondWith(
      (async () => timetableAssetResponse(request, await caches.open(CACHE_NAME)))(),
    );
    return;
  }
  if (request.mode === 'navigate' || url.pathname.startsWith(`${BASE}data/`)) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE_NAME);
        await cachedManifest(cache);
        const key = request.mode === 'navigate' ? BASE : url.pathname;
        try {
          const response = await fetch(request, { signal: AbortSignal.timeout(5000) });
          if (
            response.ok &&
            response.headers
              .get('Content-Type')
              ?.includes(request.mode === 'navigate' ? 'text/html' : 'application/json')
          ) {
            // Keep the HTML paired with the immutable asset set of this worker version.
            // A new HTML version is adopted atomically by the next worker install.
            if (request.mode !== 'navigate') {
              const safe = await safeStationResponse(response);
              await cache.put(key, safe.clone());
              return safe;
            }
            return (await cache.match(key)) || response;
          }
        } catch {
          /* Offline or timed out: use the installed station/shell. */
        }
        const saved = await cache.match(key);
        if (!saved) return Response.error();
        if (request.mode === 'navigate') return saved;
        const safe = await safeStationResponse(saved);
        await cache.put(key, safe.clone());
        return safe;
      })(),
    );
    return;
  }
  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      const saved = await cache.match(request, { ignoreSearch: true });
      if (saved) return saved;
      const response = await fetch(request);
      if (response.ok && url.pathname.startsWith(`${BASE}assets/`))
        await cache.put(request, response.clone());
      return response;
    })(),
  );
});
