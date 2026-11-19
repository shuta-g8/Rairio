import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';
import { transformWithOxc, type Plugin } from 'vite';
import { buildCodePoints, offlineFontSources } from './fonts.ts';

export function offlinePlugin(): Plugin {
  let directory = '';
  let base = '/';
  return {
    name: 'kanto-offline',
    apply: 'build',
    configResolved(config) {
      directory = resolve(config.root, config.build.outDir);
      base = config.base;
    },
    async closeBundle() {
      async function files(path: string): Promise<string[]> {
        const entries = await readdir(path, { withFileTypes: true });
        const paths = await Promise.all(
          entries.map((entry) =>
            entry.isDirectory() ? files(join(path, entry.name)) : [join(path, entry.name)],
          ),
        );
        return paths.flat();
      }
      // Modern browsers select WOFF2. Avoid downloading duplicate WOFF fallbacks.
      // Pages consumes control files instead of serving them as offline assets.
      const controlFiles = new Set([
        'sw.js',
        '_headers',
        '_redirects',
        '_routes.json',
        '_worker.js',
      ]);
      const candidates = (await files(directory))
        .filter(
          (path) => !/\.(?:woff|map)$/.test(path) && !controlFiles.has(relative(directory, path)),
        )
        .sort();
      const contents = new Map(
        await Promise.all(candidates.map(async (path) => [path, await readFile(path)] as const)),
      );
      const text = candidates.filter((path) => /\.(?:js|json|html|css|txt|svg)$/.test(path));
      const points = buildCodePoints(text.map((path) => contents.get(path)!.toString('utf8')));
      const requiredFonts = new Set<string>();
      for (const path of candidates.filter((path) => path.endsWith('.css'))) {
        const cssUrl = new URL(
          `${base}${relative(directory, path).split('\\').join('/')}`,
          'https://build.invalid',
        );
        for (const source of offlineFontSources(contents.get(path)!.toString('utf8'), points)) {
          const url = new URL(source, cssUrl);
          if (url.origin === cssUrl.origin) requiredFonts.add(url.pathname);
        }
      }
      const paths = candidates.filter(
        (path) =>
          !path.endsWith('.woff2') ||
          requiredFonts.has(`${base}${relative(directory, path).split('\\').join('/')}`),
      );
      const hash = createHash('sha256');
      for (const path of paths) hash.update(relative(directory, path)).update(contents.get(path)!);
      const urls = paths.map((path) => {
        const name = relative(directory, path).split('\\').join('/');
        // Pages redirects index.html to the directory URL. Cache the canonical shell.
        return name === 'index.html' ? base : `${base}${name}`;
      });
      const template = await readFile(new URL('../src/service-worker.js', import.meta.url), 'utf8');
      const policySource = await readFile(
        new URL('../shared/timetable-editions.ts', import.meta.url),
        'utf8',
      );
      const policy = (await transformWithOxc(policySource, 'timetable-editions.ts')).code
        .replace(/^export\s*\{[^}]*\};?\s*$/gm, '')
        .replace(/^export /gm, '');
      const manifest = await readFile(
        new URL('../shared/asakusa-timetable-manifest.json', import.meta.url),
        'utf8',
      );
      hash.update(template);
      hash.update(policySource).update(manifest);
      await writeFile(
        join(directory, 'sw.js'),
        template
          .replace('__CACHE_VERSION__', hash.digest('hex').slice(0, 16))
          .replace('__PRECACHE_URLS__', JSON.stringify(urls))
          .replace('__BASE_PATH__', JSON.stringify(base))
          .replace('__TIMETABLE_POLICY__', policy)
          .replace('__INITIAL_TIMETABLE_MANIFEST__', manifest.trim()),
      );
    },
  };
}
