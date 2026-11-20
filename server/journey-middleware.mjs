import { Readable } from 'node:stream';
import { createJourneyHandler } from './journey-api.mjs';

export function journeyMiddleware(base = '/') {
  const endpoint = `${base.replace(/\/$/, '')}/api/journey`;
  const handler = createJourneyHandler();
  // Loopback-only prototype testing. Production Pages uses a shared budget.
  let plans = [];
  const fares = new Map();
  const env = {
    JOURNEY_TRANSITOUS_ENABLED: process.env.JOURNEY_TRANSITOUS_ENABLED,
    JOURNEY_FARES_ENABLED: process.env.JOURNEY_FARES_ENABLED,
    JOURNEY_FARE_SIGNING_SECRET: process.env.JOURNEY_FARE_SIGNING_SECRET,
    NAVITIME_RAPIDAPI_KEY: process.env.NAVITIME_RAPIDAPI_KEY,
    JOURNEY_BUDGET: {
      getByName: () => ({
        async fetch(request) {
          const now = Date.now();
          if (new URL(request.url).pathname === '/plan') {
            plans = plans.filter((time) => time > now - 24 * 60 * 60_000);
            if (plans.length >= 12) return new Response(null, { status: 429 });
            plans.push(now);
            return new Response(null, { status: 204 });
          }
          const id = await request.text();
          for (const [id, time] of fares) if (time <= now - 30 * 60_000) fares.delete(id);
          if (fares.has(id)) return new Response(null, { status: 409 });
          fares.set(id, now);
          return new Response(null, { status: 204 });
        },
      }),
    },
  };
  return async (req, res, next) => {
    if (new URL(req.url || '/', 'http://localhost').pathname !== endpoint) return next();
    if (
      !/^(?:127\.0\.0\.1|localhost|\[::1\])(?::\d+)?$/.test(req.headers.host ?? '') ||
      !['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress)
    ) {
      res.writeHead(404).end();
      return;
    }
    const request = new Request(new URL(endpoint, 'http://' + req.headers.host), {
      method: req.method,
      headers: req.headers,
      ...(req.method === 'POST' ? { body: Readable.toWeb(req), duplex: 'half' } : {}),
    });
    const response = await handler({ request, env });
    res.writeHead(response.status, Object.fromEntries(response.headers));
    res.end(await response.text());
  };
}
