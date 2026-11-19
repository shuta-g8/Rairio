import { mkdir, writeFile, rename, readFile, unlink, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { STATION_GUIDANCE_CHECKED_AT, STATION_SUBNAME_SOURCE } from '../shared/station-guidance.ts';
import { format } from 'prettier';
import { generateStationDirectory } from './generate-station-directory.mjs';
import { createLookups, buildStation } from './toei-timetable-source.mjs';
import { managedAsakusaRoutes } from './asakusa-managed-data.mjs';
import { createStationCatalog, parseStationBasics, SUBWAY_LINES } from './toei-station-source.mjs';
import {
  ODPT_API,
  TOEI_OPERATOR,
  STATION_BASICS_CSV,
  DATA_LICENSE,
  TIMETABLE_SOURCE,
} from '../shared/transit-source.ts';

const target = process.argv.find((arg) => arg.startsWith('--station='))?.split('=')[1];
const cached = process.argv.includes('--cached');
const sources = [];
await mkdir('.cache/odpt', { recursive: true });

async function getSource(name, url, binary = false) {
  const path = `.cache/odpt/${name}`;
  let content;
  if (cached) content = await readFile(path);
  else {
    const response = await fetch(url, { signal: AbortSignal.timeout(60000), redirect: 'error' });
    if (!response.ok) throw new Error(`HTTP ${response.status}: ${name}`);
    content = Buffer.from(await response.arrayBuffer());
    if (!binary) {
      const data = JSON.parse(content.toString('utf8'));
      // The API caps a response at 1,000. Split train data by line and calendar.
      if (!Array.isArray(data) || !data.length || data.length >= 1000)
        throw new Error(`不完全な応答: ${name} (${data.length})`);
    }
    await writeFile(path, content);
  }
  sources.push({
    url,
    fetchedAt: (await stat(path)).mtime.toISOString(),
    sha256: createHash('sha256').update(content).digest('hex'),
  });
  return binary ? content : JSON.parse(content.toString('utf8'));
}

async function get(name, type, extra = '') {
  const data = await getSource(
    `${name}.json`,
    `${ODPT_API}odpt:${type}?odpt:operator=${TOEI_OPERATOR}${extra}`,
  );
  if (!Array.isArray(data) || !data.length || data.length >= 1000)
    throw new Error(`不完全な応答: ${type}`);
  return data;
}

const tables = await get('station-timetables', 'StationTimetable');
const rawStations = await get('stations', 'Station');
const rawRailways = await get('railways', 'Railway');
const types = await get('train-types', 'TrainType');
await get('rail-directions', 'RailDirection');
const basicsCsv = await getSource('station-basics.csv', STATION_BASICS_CSV, true);
const basics = parseStationBasics(new TextDecoder('shift_jis', { fatal: true }).decode(basicsCsv));
const catalog = createStationCatalog(rawStations, rawRailways, basics);
if (target && !catalog.stations.some((station) => station.id === target))
  throw new Error('Unknown station');
const trains = [];
for (const line of SUBWAY_LINES) {
  for (const calendar of ['Weekday', 'SaturdayHoliday'])
    trains.push(
      ...(await get(
        `train-timetables-${line.toLowerCase()}-${calendar.toLowerCase()}`,
        'TrainTimetable',
        `&odpt:railway=odpt.Railway:Toei.${line}&odpt:calendar=odpt.Calendar:${calendar}`,
      )),
    );
}
const lookups = createLookups(rawStations, types, trains, catalog.railways);
const fetchedAt = new Date(
  Math.min(...sources.map((source) => Date.parse(source.fetchedAt))),
).toISOString();
// Validate all 4 lines before replacing any distributed file, even for a targeted refresh.
const managed = await managedAsakusaRoutes();
const all = catalog.stations.map((station) =>
  buildStation(station, tables, lookups, fetchedAt, managed.routes.get(station.id)),
);
const pending = all.filter((station) => !target || station.id === target);
const report = {
  fetchedAt,
  generatedAt: new Date().toISOString(),
  asakusaTimetableEdition: { generation: managed.manifest.generation, active: managed.active },
  cached,
  license: DATA_LICENSE,
  guidanceCheckedAt: STATION_GUIDANCE_CHECKED_AT,
  subnameSource: STATION_SUBNAME_SOURCE,
  stationInfoPageCount: catalog.stations.filter((station) => station.stationInfoUrl).length,
  subnameStationCount: catalog.stations.filter((station) => station.secondaryName).length,
  stationCount: all.length,
  lineStationCount: all.reduce((sum, station) => sum + station.memberships.length, 0),
  routeCount: all.reduce((sum, station) => sum + station.routes.length, 0),
  stationTimetableCount: all.flatMap((station) => station.routes).length * 2,
  trainTimetableCount: trains.length,
  scheduleEntryCount: all
    .flatMap((station) => station.routes)
    .reduce(
      (sum, route) => sum + route.schedules.weekday.length + route.schedules.holiday.length,
      0,
    ),
  lines: catalog.railways.map((line) => {
    const routes = all.flatMap((station) =>
      station.routes.filter((route) => route.railwayId === line.id),
    );
    return {
      id: line.id,
      name: line.name,
      stationCount: new Set(line.stationIds).size,
      routeCount: routes.length,
      sourceUpdated: new Date(
        Math.min(...routes.map((route) => Date.parse(route.sourceUpdated))),
      ).toISOString(),
    };
  }),
  sources,
};
const provenance = {
  fetchedAt,
  timetableSource: TIMETABLE_SOURCE,
  basicsSource: catalog.basicsSource,
  license: DATA_LICENSE,
};
const generated = `// Generated by npm run data:refresh. Do not edit by hand.\nimport type { Station } from '../stations.ts';\nexport const STATION_CATALOG: Station[] = ${JSON.stringify(catalog.stations, null, 2)};\nexport const RAILWAY_CATALOG = ${JSON.stringify(catalog.railways, null, 2)};\nexport const STATION_CATALOG_SOURCE = ${JSON.stringify(provenance, null, 2)};\n`;
await mkdir('public/data', { recursive: true });
await mkdir('public/metadata', { recursive: true });
await mkdir('shared/generated', { recursive: true });
async function replace(path, content) {
  await writeFile(`${path}.tmp`, content);
  try {
    await rename(`${path}.tmp`, path);
  } catch (error) {
    // Windows watchers may hold a handle that permits writes but prevents replacement.
    if (process.platform !== 'win32' || error.code !== 'EPERM') throw error;
    await writeFile(path, content);
    await unlink(`${path}.tmp`);
  }
}
for (const data of pending) {
  await replace(`public/data/${data.id}.json`, JSON.stringify(data) + '\n');
  console.log(`${data.name}: ${data.routes.length}方面 / 出典更新 ${data.sourceUpdated}`);
}
if (!target) {
  const formatting = JSON.parse(
    await readFile(new URL('../.prettierrc.json', import.meta.url), 'utf8'),
  );
  await replace(
    'shared/generated/station-catalog.ts',
    await format(generated, { ...formatting, parser: 'typescript' }),
  );
  await replace('public/metadata/toei-coverage.json', JSON.stringify(report, null, 2) + '\n');
  await generateStationDirectory({ stations: catalog.stations, railways: catalog.railways });
}
console.log(
  `全${report.stationCount}駅（延べ${report.lineStationCount}駅）・${report.routeCount}方面・${report.stationTimetableCount}時刻表を照合しました。`,
);
