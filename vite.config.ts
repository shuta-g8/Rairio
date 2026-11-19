import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { offlinePlugin } from './build/offline.ts';
import { woff2Fonts } from './build/fonts.ts';
// @ts-expect-error The same Node middleware is used by development, preview and production.
import { operationsMiddleware } from './server/operations-middleware.mjs';
// @ts-expect-error Shared Node middleware also serves the Pages-compatible data provider.
import { trainPositionsMiddleware } from './server/train-positions-middleware.mjs';

export default defineConfig({
  plugins: [
    react(),
    woff2Fonts(),
    offlinePlugin(),
    {
      name: 'kanto-operations-api',
      configureServer(server) {
        server.middlewares.use(operationsMiddleware(server.config.base));
        server.middlewares.use(trainPositionsMiddleware(server.config.base));
      },
      configurePreviewServer(server) {
        server.middlewares.use(operationsMiddleware(server.config.base));
        server.middlewares.use(trainPositionsMiddleware(server.config.base));
      },
    },
  ],
  build: {
    license: { fileName: 'licenses/bundled-dependencies.txt' },
    rolldownOptions: {
      output: {
        comments: { legal: true },
        banner:
          '/*! Third-party copyright and license notices: ../licenses/third-party-notices.txt */',
      },
    },
  },
  base: process.env.BASE_PATH || '/',
});
