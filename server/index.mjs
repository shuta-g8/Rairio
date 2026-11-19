import { createServer } from 'node:http';
import { operationsMiddleware } from './operations-middleware.mjs';
import { trainPositionsMiddleware } from './train-positions-middleware.mjs';
import { createStaticHandler, normalizeBasePath } from './static-files.mjs';

const base = normalizeBasePath(process.env.BASE_PATH || '/');
const host = process.env.HOST || '127.0.0.1';
const port = Number(process.env.PORT || 4173);
const operations = operationsMiddleware(base);
const trainPositions = trainPositionsMiddleware(base);
const serveStatic = createStaticHandler({
  base,
  cacheControl: (relative) =>
    relative.startsWith('assets/') ? 'public, max-age=31536000, immutable' : 'no-cache',
});

createServer((request, response) => {
  operations(request, response, () =>
    trainPositions(request, response, () => serveStatic(request, response)),
  ).catch(() => {
    if (!response.headersSent) response.writeHead(500);
    response.end();
  });
}).listen(port, host, () => console.log(`Rairio: http://${host}:${port}${base}`));
