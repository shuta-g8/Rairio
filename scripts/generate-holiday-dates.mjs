import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { format, resolveConfig } from 'prettier';
import holidayJp from '@holiday-jp/holiday_jp';

const directory = 'src/generated';
await mkdir(directory, { recursive: true });
const source = `// Generated from @holiday-jp/holiday_jp ${holidayJp.VERSION}. Run npm run data:holidays to update.
// All supported dates are retained. Copyright (c) 2016 holiday-jp, MIT; see public/licenses/holiday-jp.txt.
export const HOLIDAY_SOURCE_VERSION = ${JSON.stringify(holidayJp.VERSION)};
export const HOLIDAY_DATES: ReadonlySet<string> = new Set(${JSON.stringify(Object.keys(holidayJp.holidays).sort().join(' '))}.split(' '));
`;
await writeFile(
  join(directory, 'holiday-dates.ts'),
  await format(source, {
    ...(await resolveConfig(join(directory, 'holiday-dates.ts'))),
    filepath: 'holiday-dates.ts',
  }),
);
await mkdir('public/licenses', { recursive: true });
const require = createRequire(import.meta.url);
await writeFile(
  'public/licenses/holiday-jp.txt',
  await readFile(join(dirname(require.resolve('@holiday-jp/holiday_jp/package.json')), 'LICENSE')),
);
console.log(
  `Generated ${Object.keys(holidayJp.holidays).length} holiday dates (${holidayJp.VERSION}).`,
);
