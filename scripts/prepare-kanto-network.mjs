import { mkdir, readFile, writeFile, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { STATIONS } from '../shared/stations.ts';
import {
  KANTO_API,
  KANTO_API_DOCS,
  KANTO_DATA_TERMS,
  KANTO_PROVIDER,
} from '../shared/journey-sources.ts';

const API = KANTO_API;
const cached = process.argv.includes('--cached');
await mkdir('.cache/kanto', { recursive: true });
const sources = [];
async function get(path, key) {
  const file = `.cache/kanto/${key}.json`;
  let raw;
  if (cached) raw = await readFile(file, 'utf8');
  else {
    const response = await fetch(API + path, { signal: AbortSignal.timeout(30000) });
    if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`);
    raw = await response.text();
    await writeFile(file, raw);
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  const data = JSON.parse(raw);
  if (!Array.isArray(data)) throw new Error(`Invalid response ${path}`);
  sources.push({
    url: API + path,
    sha256: createHash('sha256').update(raw).digest('hex'),
    fetchedAt: (await stat(file)).mtime.toISOString(),
  });
  return data;
}
async function pages(path, key) {
  const all = [],
    seen = new Set();
  for (let page = 1; page <= 100; page++) {
    const rows = await get(`${path}?page=${page}`, `${key}-${page}`);
    if (!rows.length) return all;
    const signature = (rows) => JSON.stringify(rows.map((r) => r.station_cd ?? r.line_cd));
    const hash = signature(rows);
    // The provider clamps an out-of-range page to its last page (which can contain 50 rows).
    if (seen.has(hash)) {
      if (hash !== signature(all.slice(-rows.length)))
        throw new Error(`Pagination repeated ${path}`);
      return all;
    }
    seen.add(hash);
    all.push(...rows);
    if (rows.length < 50) return all;
  }
  throw new Error(`Too many pages ${path}`);
}
const lines = await pages('/lines.json', 'lines');
const raw = [];
for (const pref of [8, 9, 10, 11, 12, 13, 14]) {
  const rows = await pages(`/prefectures/${pref}/stations.json`, `pref-${pref}`);
  console.log(`Prefecture ${pref}: ${rows.length} line stations`);
  raw.push(...rows);
}
const activeLines = new Map(
  lines
    .filter((l) => l.e_status === 0 && !l.line_name.includes('新幹線'))
    .map((l) => [l.line_cd, l]),
);
const active = raw.filter((s) => s.e_status === 0 && activeLines.has(s.line_cd));
const groups = new Map();
const toeiLines = { 99301: 'Oedo', 99302: 'Asakusa', 99303: 'Mita', 99304: 'Shinjuku' };
const links = new Map();
for (const s of active) {
  const id = String(s.station_g_cd);
  if (!groups.has(id))
    groups.set(id, {
      id,
      name: s.station_name,
      names: [],
      reading: [],
      english: [],
      pref: s.pref_cd,
      lat: Number(s.lat),
      lon: Number(s.lon),
      lines: [],
    });
  const g = groups.get(id);
  g.names.push(s.station_name);
  if (s.station_name_k) g.reading.push(s.station_name_k);
  if (s.station_name_r) g.english.push(s.station_name_r);
  g.lines.push(String(s.line_cd));
  if (toeiLines[s.line_cd]) {
    const station = STATIONS.find(
      (t) =>
        t.name === s.station_name.split('（')[0] &&
        t.memberships?.some((m) => m.railwayId === toeiLines[s.line_cd]),
    );
    if (!station) throw new Error(`Unmatched Toei station: ${s.station_name}`);
    if (links.has(station.id) && links.get(station.id) !== id)
      throw new Error(`Ambiguous Toei group: ${station.id}`);
    links.set(station.id, id);
  }
}
if (links.size !== 99 || groups.size < 1500)
  throw new Error(`Incomplete network: ${links.size} Toei / ${groups.size} groups`);
const stations = [...groups.values()].map((g) => ({
  ...g,
  names: [...new Set(g.names)],
  reading: [...new Set(g.reading)],
  english: [...new Set(g.english)],
  lines: [...new Set(g.lines)],
}));
const usedLines = new Set(stations.flatMap((s) => s.lines));
const network = {
  version: 1,
  fetchedAt: new Date(Math.min(...sources.map((s) => Date.parse(s.fetchedAt)))).toISOString(),
  provider: KANTO_PROVIDER,
  source: KANTO_API_DOCS,
  terms: KANTO_DATA_TERMS,
  prefectures: [8, 9, 10, 11, 12, 13, 14],
  stations,
  lines: [...activeLines.values()]
    .filter((l) => usedLines.has(String(l.line_cd)))
    .map((l) => ({
      id: String(l.line_cd),
      name: l.line_name,
      color: l.line_color_c || '#687582',
      stations: stations.filter((s) => s.lines.includes(String(l.line_cd))).map((s) => s.id),
    })),
  toei: Object.fromEntries(links),
  sources,
};
await mkdir('src/generated', { recursive: true });
await writeFile('src/generated/kanto-network.json', JSON.stringify(network) + '\n');
console.log(`Generated ${stations.length} station groups / ${network.lines.length} lines`);
