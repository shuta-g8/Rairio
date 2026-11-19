import { readFile, readdir, writeFile } from 'node:fs/promises';
import {
  DATA_LICENSE,
  DATA_PROVIDER,
  TIMETABLE_SOURCE,
  STATION_INFO_SOURCE,
  STATION_BASICS_SOURCE,
  OPERATIONS_CATALOG,
} from '../shared/transit-source.ts';
import { TRAIN_POSITIONS_CATALOG } from '../shared/train-positions.ts';
import {
  JOURNEY_GTFS_CATALOG,
  JOURNEY_GTFS_DOWNLOAD,
  KANTO_API_DOCS,
  KANTO_DATA_TERMS,
  KANTO_PROVIDER,
  TOEI_FARE_SOURCE,
  YAMANOTE_ORDER_SOURCE,
} from '../shared/journey-sources.ts';

const root = new URL('../', import.meta.url);
const output = new URL('public/licenses/third-party-notices.txt', root);
const lock = JSON.parse(await readFile(new URL('package-lock.json', root), 'utf8'));
const packages = Object.entries(lock.packages)
  .filter(([path, entry]) => path && !entry.dev && !entry.link)
  .sort(([left], [right]) => left.localeCompare(right, 'en'));

const sections = [];
for (const [path, entry] of packages) {
  const directory = new URL(`${path}/`, root);
  const manifest = JSON.parse(await readFile(new URL('package.json', directory), 'utf8'));
  if (manifest.version !== entry.version) {
    throw new Error(
      `${manifest.name}: installed version differs from package-lock.json; run npm ci.`,
    );
  }
  let text;
  if (manifest.name === '@fontsource/line-seed-jp') {
    // The package's generic LICENSE omits LY Corporation; retain the official font license.
    text = await readFile(new URL('public/licenses/line-seed-jp.txt', root), 'utf8');
    if (!text.includes('LY Corporation') || !text.includes('SIL OPEN FONT LICENSE Version 1.1')) {
      throw new Error('The official LINE Seed JP copyright notice and OFL text are required.');
    }
  } else if (manifest.name === 'gsap') {
    const notices = [];
    for (const file of [
      'gsap-core.js',
      'CSSPlugin.js',
      'DrawSVGPlugin.js',
      'MotionPathPlugin.js',
    ]) {
      const source = await readFile(new URL(file, directory), 'utf8');
      const notice = source.match(/\/\*![\s\S]*?\*\//)?.[0];
      if (!notice?.includes('Copyright') || !notice.includes('https://gsap.com/standard-license')) {
        throw new Error(`Missing GSAP license notice: ${file}`);
      }
      notices.push(notice);
    }
    text = `${notices.join('\n\n')}\n\nLicense terms: https://gsap.com/community/standard-license/`;
  } else {
    const files = await readdir(directory);
    const file = files.find((name) => /^(?:licen[cs]e|copying)(?:\.[^.]+)?$/i.test(name));
    if (!file) throw new Error(`Review the license for ${manifest.name}: no license file found.`);
    text = await readFile(new URL(file, directory), 'utf8');
  }
  sections.push(
    `${manifest.name} ${manifest.version}\nLicense: ${manifest.license}\n\n${text.replace(/\r\n/g, '\n').trim()}`,
  );
}

// Vendored SVG assets are not represented in package-lock.json.
sections.push(
  `Google Material Design Icons (flight)\nLicense: Apache-2.0\n\n${(
    await readFile(new URL('public/licenses/material-design-icons.txt', root), 'utf8')
  ).trim()}`,
);

const notices = [
  'Third-party software notices for Rairio',
  'Generated from the installed production dependencies, package-lock.json, and vendored assets.',
  'Licenses apply to the respective components, including related type definitions.',
  '',
  sections.join('\n\n========================================\n\n'),
  '',
].join('\n');

const dataNotices = [
  'Rairio - data sources, attribution and modifications',
  '',
  '1. Toei public transport data',
  `Provider / 提供者: ${DATA_PROVIDER}`,
  `License: Creative Commons Attribution 4.0 International (CC BY 4.0) - ${DATA_LICENSE}`,
  `Train information (GTFS): ${JOURNEY_GTFS_CATALOG}`,
  `GTFS download: ${JOURNEY_GTFS_DOWNLOAD}`,
  `Station timetables: ${TIMETABLE_SOURCE}`,
  `Station information and coordinates: ${STATION_INFO_SOURCE}`,
  `Station basics: ${STATION_BASICS_SOURCE}`,
  `Train operations: ${OPERATIONS_CATALOG}`,
  `Train locations: ${TRAIN_POSITIONS_CATALOG}`,
  'Modifications by Rairio: select the four subway lines; merge line-specific station IDs;',
  'convert timetable and fare data; apply calendars; calculate journeys and ordinary fares;',
  'match train observations to departures; calculate nearby stations locally from station coordinates.',
  `Ordinary fare reference: ${TOEI_FARE_SOURCE}`,
  '',
  '2. Kanto station and line data',
  `API / data source: ${KANTO_PROVIDER}`,
  `API documentation: ${KANTO_API_DOCS}`,
  'Original database provider: 駅データ.jp / 株式会社バリューアンドビジョン',
  `Applicable terms: ${KANTO_DATA_TERMS}`,
  'Modifications by Rairio: select Tokyo, Kanagawa, Saitama, Chiba, Ibaraki, Tochigi and Gunma;',
  'exclude Shinkansen and inactive stations; merge interchange station groups;',
  'derive supplemental railway connections and independently reviewed line symbols.',
  'This data is used under the station database terms above; it is not relicensed as CC BY.',
  '',
  '3. Station order reference',
  `JR East Tokyo-area route map: ${YAMANOTE_ORDER_SOURCE}`,
  'Used as a reference for Yamanote station order. The map artwork is not included.',
  '',
  'Rairio is an independent application. Data providers do not endorse this application.',
  'Software and font notices are provided separately in third-party-notices.txt.',
  '',
].join('\n');

for (const [path, contents] of [
  [output, notices],
  [new URL('public/licenses/data-sources.txt', root), dataNotices],
]) {
  if (process.argv.includes('--check')) {
    if ((await readFile(path, 'utf8')) !== contents)
      throw new Error('License or data notices are out of date. Run npm run licenses:generate.');
  } else await writeFile(path, contents);
}
console.log(
  `${process.argv.includes('--check') ? 'Verified' : 'Generated'} notices for ${packages.length} production dependencies, vendored assets and data sources.`,
);
