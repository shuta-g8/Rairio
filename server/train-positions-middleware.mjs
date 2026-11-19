import { createTrainPositionsProvider } from './train-positions.mjs';
import { parseFeedIds, filterPositions } from '../shared/position-feed.ts';

const provider = createTrainPositionsProvider();
export function trainPositionsMiddleware(base = '/') {
  const endpoint = `${base.replace(/\/$/, '')}/api/train-positions`;
  return async (req, res, next) => {
    if (new URL(req.url || '/', 'http://localhost').pathname !== endpoint) return next();
    const url = new URL(req.url || '/', 'http://localhost');
    const ids = url.searchParams.has('id') ? parseFeedIds(url) : undefined;
    if (url.searchParams.has('id') && !ids) {
      res.statusCode = 400;
      res.end();
      return;
    }
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    if (req.method !== 'GET') {
      res.statusCode = 405;
      res.setHeader('Allow', 'GET');
      res.end(JSON.stringify({ error: 'GET only' }));
      return;
    }
    try {
      const snapshot = await provider.get();
      const raw = ids ? filterPositions(snapshot, ids) : snapshot;
      res.end(
        JSON.stringify(
          process.env.POSITION_DISPLAY_MODE === 'legacy' ? raw : { ...raw, collected: null },
        ),
      );
    } catch {
      res.statusCode = 503;
      res.end(JSON.stringify({ error: '列車位置を取得できませんでした。' }));
    }
  };
}
