import { createOperationsProvider } from './operations.mjs';

const provider = createOperationsProvider();
export function operationsMiddleware(base = '/') {
  const endpoint = `${base.replace(/\/$/, '')}/api/operations`;
  return async (req, res, next) => {
    const pathname = new URL(req.url || '/', 'http://localhost').pathname;
    if (pathname !== endpoint) {
      return next();
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
      res.end(JSON.stringify(await provider.get()));
    } catch {
      res.statusCode = 503;
      res.end(
        JSON.stringify({
          error: '運行情報を取得できませんでした。保存済みの情報と時刻表をご利用ください。',
        }),
      );
    }
  };
}
