import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';

const CONTENT_TYPES = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.txt': 'text/plain',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
};

export function normalizeBasePath(base = '/') {
  return `/${base.split('/').filter(Boolean).join('/')}`.replace(/\/?$/, '/');
}

/** Node-only static serving. Pages Functions import the operations provider independently. */
export function createStaticHandler({
  directory = 'dist',
  base = '/',
  cacheControl = () => 'no-store',
  charset = true,
  forbiddenStatus = 403,
} = {}) {
  const root = resolve(directory);
  const prefix = normalizeBasePath(base);
  return async (request, response) => {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      response.writeHead(405);
      response.end();
      return;
    }
    try {
      const pathname = decodeURIComponent(new URL(request.url || '/', 'http://localhost').pathname);
      if (!pathname.startsWith(prefix)) {
        response.writeHead(404);
        response.end();
        return;
      }
      const relative = pathname.slice(prefix.length) || 'index.html';
      const file = resolve(root, relative);
      if (!file.startsWith(`${root}${sep}`)) {
        response.writeHead(forbiddenStatus);
        response.end();
        return;
      }
      if (!(await stat(file)).isFile()) {
        response.writeHead(404);
        response.end();
        return;
      }
      const encoding = charset && /\.(html|js|css|json|txt)$/.test(file) ? '; charset=utf-8' : '';
      response.setHeader(
        'Content-Type',
        `${CONTENT_TYPES[extname(file)] || 'application/octet-stream'}${encoding}`,
      );
      response.setHeader('Cache-Control', cacheControl(relative));
      if (request.method === 'HEAD') {
        response.end();
        return;
      }
      const stream = createReadStream(file);
      stream.on('error', () => response.destroy());
      stream.pipe(response);
    } catch {
      response.writeHead(404);
      response.end();
    }
  };
}
