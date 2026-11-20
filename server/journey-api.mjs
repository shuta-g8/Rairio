import { securityHeaders } from '../shared/security-headers.mjs';
import { resolveJourneyQuery } from './journey-stations.mjs';
import { transitousPlanUrl, transitousResults } from './journey-transitous.mjs';
import { matchJourneyFares, navitimeFareUrl, navitimeHost } from './journey-navitime.mjs';

const headers = { ...securityHeaders, 'Cache-Control': 'private, no-store' };
const encoder = new TextEncoder();
const decoder = new TextDecoder();
const fareTokenLifetime = 15 * 60_000;
const apiVersion = '1.3.0';

const json = (body, status = 200) => Response.json(body, { headers, status });
const failure = (error, status, code) => json({ error, code }, status);

async function readJson(stream, limit) {
  if (!stream) throw new Error('Missing JSON');
  const reader = stream.getReader();
  let size = 0;
  let content = '';
  const text = new TextDecoder();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) return JSON.parse(content + text.decode());
      size += value.byteLength;
      if (size > limit) {
        await reader.cancel();
        throw new Error('JSON too large');
      }
      content += text.decode(value, { stream: true });
    }
  } finally {
    reader.releaseLock();
  }
}

const encode = (bytes) =>
  btoa(Array.from(bytes, (byte) => String.fromCharCode(byte)).join(''))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/, '');
const decode = (value) =>
  Uint8Array.from(atob(value.replaceAll('-', '+').replaceAll('_', '/')), (c) => c.charCodeAt(0));
const signingKey = (secret) =>
  crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, [
    'sign',
    'verify',
  ]);

async function signFareSearch(key, input, candidates) {
  const payload = encode(
    encoder.encode(
      JSON.stringify({
        id: crypto.randomUUID(),
        expires: Date.now() + fareTokenLifetime,
        input,
        candidates,
      }),
    ),
  );
  if (payload.length > 60_000) return undefined;
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(payload));
  return payload + '.' + encode(new Uint8Array(signature));
}

async function readFareSearch(secret, value) {
  if (typeof value !== 'string' || !/^[\w-]+\.[\w-]{43}$/.test(value)) return;
  try {
    const [payload, signature] = value.split('.');
    if (
      !(await crypto.subtle.verify(
        'HMAC',
        await signingKey(secret),
        decode(signature),
        encoder.encode(payload),
      ))
    )
      return;
    const claims = JSON.parse(decoder.decode(decode(payload)));
    return claims.expires > Date.now() ? claims : undefined;
  } catch {
    return undefined;
  }
}

async function reserve(env, kind, id) {
  const response = await env.JOURNEY_BUDGET.getByName('rairio-journey').fetch(
    new Request('https://journey-budget.invalid/' + kind, { method: 'POST', body: id }),
  );
  if (response.status === 204 || response.status === 409 || response.status === 429)
    return response.status;
  throw new Error('Budget unavailable');
}

async function getProvider(fetcher, url, selectedHeaders) {
  const response = await fetcher(url, {
    cache: 'no-store',
    headers: { Accept: 'application/json', ...selectedHeaders },
    redirect: 'manual',
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) {
    await response.body?.cancel();
    return { status: response.status === 429 ? 429 : 502 };
  }
  return { data: await readJson(response.body, 2 * 1024 * 1024) };
}

const rateLimited = () => failure('検索の利用上限に達しました。時間をおいてお試しください。', 429);
const providerFailure = () => failure('検索先に接続できません。', 502);

export function createJourneyHandler(fetcher = fetch) {
  return async function journey({ request, env }) {
    const url = new URL(request.url);
    if (request.method !== 'POST')
      return Response.json(
        { error: 'POST only' },
        { status: 405, headers: { ...headers, Allow: 'POST' } },
      );
    if (
      request.headers.get('Origin') !== url.origin ||
      request.headers.get('Content-Type')?.split(';')[0] !== 'application/json'
    )
      return failure('同じサイトから検索してください。', 403);
    if (env.JOURNEY_TRANSITOUS_ENABLED !== '1' || !env.JOURNEY_BUDGET)
      return failure('オンライン経路検索は準備中です。', 503, 'disabled');

    let input;
    try {
      input = await readJson(request.body, 65_536);
    } catch {
      return failure('検索条件が不正です。', 400);
    }
    const fareEnabled =
      env.JOURNEY_FARES_ENABLED === '1' &&
      env.NAVITIME_RAPIDAPI_KEY &&
      env.JOURNEY_FARE_SIGNING_SECRET?.length >= 32;
    try {
      if (input?.action === 'plan') {
        const { from, to, time, conventionalOnly } = input;
        const query = resolveJourneyQuery({ from, to, time, conventionalOnly });
        if (!query) return failure('都営地下鉄の駅を片方に選び、駅と日時を確認してください。', 400);
        if ((await reserve(env, 'plan')) !== 204) return rateLimited();
        const { status, data } = await getProvider(fetcher, transitousPlanUrl(query), {
          'User-Agent': `Rairio/${apiVersion} (+https://rairio.jp/)`,
        });
        if (status === 429) return rateLimited();
        if (!Array.isArray(data?.itineraries)) return providerFailure();
        const results = transitousResults(data, query);
        const candidates = results.flatMap(({ fare }) => (fare ? [fare] : []));
        const fareToken =
          fareEnabled && candidates.length
            ? await signFareSearch(
                await signingKey(env.JOURNEY_FARE_SIGNING_SECRET),
                { from, to, time, conventionalOnly: query.conventionalOnly },
                candidates,
              )
            : undefined;
        const fareAvailability = fareToken ? 'ready' : fareEnabled ? 'no-candidate' : 'disabled';
        return json({ routes: results.map(({ route }) => route), fareAvailability, fareToken });
      }
      if (input?.action === 'fare') {
        if (!fareEnabled) return failure('運賃検索は準備中です。', 503);
        const claims = await readFareSearch(env.JOURNEY_FARE_SIGNING_SECRET, input.token);
        const query = claims && resolveJourneyQuery(claims.input);
        if (!query)
          return failure('検索結果の有効期限が切れました。経路を検索し直してください。', 400);
        const reserved = await reserve(env, 'fare', claims.id);
        if (reserved === 409) return failure('この検索結果の運賃はすでに取得しました。', 409);
        if (reserved !== 204) return rateLimited();
        const { status, data } = await getProvider(fetcher, navitimeFareUrl(query), {
          'X-RapidAPI-Host': navitimeHost,
          'X-RapidAPI-Key': env.NAVITIME_RAPIDAPI_KEY,
        });
        if (status === 429) return rateLimited();
        if (!Array.isArray(data?.items)) return providerFailure();
        return json({ fares: matchJourneyFares(data.items, claims.candidates) });
      }
      return failure('検索の種類が不正です。', 400);
    } catch {
      return providerFailure();
    }
  };
}
