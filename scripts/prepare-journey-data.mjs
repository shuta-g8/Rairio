import { readFile, writeFile, mkdir, rename, stat, unlink } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { inflateRawSync } from 'node:zlib';
import { STATIONS } from '../shared/stations.ts';
import { DATA_LICENSE, DATA_PROVIDER } from '../shared/transit-source.ts';
import { ASAKUSA_CUTOVER } from '../shared/timetable-editions.ts';
import { fareKey } from '../shared/journey.ts';
import { JOURNEY_GTFS_DOWNLOAD } from '../shared/journey-sources.ts';

const source = JOURNEY_GTFS_DOWNLOAD;
const cached = process.argv.includes('--cached');
await mkdir('.cache/journey', { recursive: true });
const archivePath = '.cache/journey/toei.zip';
let archive;
if (cached) archive = await readFile(archivePath);
else {
  const response = await fetch(source, { signal: AbortSignal.timeout(60000), redirect: 'error' });
  if (!response.ok) throw new Error(`GTFS HTTP ${response.status}`);
  archive = Buffer.from(await response.arrayBuffer());
  await writeFile(archivePath, archive);
}

// Read the central directory; never extract archive-supplied paths to disk.
const files = new Map();
let eocd = archive.length - 22;
const minimumEocd = Math.max(0, archive.length - 65557);
while (eocd >= Math.max(0, archive.length - 65557) && archive.readUInt32LE(eocd) !== 0x06054b50)
  eocd--;
if (eocd < minimumEocd) throw new Error('Invalid ZIP');
let offset = archive.readUInt32LE(eocd + 16);
for (let i = 0; i < archive.readUInt16LE(eocd + 10); i++) {
  if (archive.readUInt32LE(offset) !== 0x02014b50) throw new Error('Invalid ZIP entry');
  const method = archive.readUInt16LE(offset + 10);
  const size = archive.readUInt32LE(offset + 20);
  const nameLength = archive.readUInt16LE(offset + 28);
  const local = archive.readUInt32LE(offset + 42);
  const name = archive.subarray(offset + 46, offset + 46 + nameLength).toString();
  const begin = local + 30 + archive.readUInt16LE(local + 26) + archive.readUInt16LE(local + 28);
  const bytes = archive.subarray(begin, begin + size);
  if (method !== 0 && method !== 8) throw new Error('Unsupported ZIP compression');
  files.set(
    name,
    (method === 8 ? inflateRawSync(bytes, { maxOutputLength: 30_000_000 }) : bytes).toString(
      'utf8',
    ),
  );
  offset += 46 + nameLength + archive.readUInt16LE(offset + 30) + archive.readUInt16LE(offset + 32);
}

function csv(name) {
  const input = files.get(name);
  if (!input) throw new Error(`Missing ${name}`);
  const rows = [];
  let row = [],
    cell = '',
    quoted = false;
  for (let i = 0; i < input.length; i++) {
    const char = input[i];
    if (char === '"') {
      if (quoted && input[i + 1] === '"') {
        cell += '"';
        i++;
      } else quoted = !quoted;
    } else if (!quoted && (char === ',' || char === '\n')) {
      row.push(cell.replace(/\r$/, ''));
      cell = '';
      if (char === '\n') {
        rows.push(row);
        row = [];
      }
    } else cell += char;
  }
  if (quoted) throw new Error(`Invalid CSV: ${name}`);
  if (cell || row.length) rows.push([...row, cell.replace(/\r$/, '')]);
  const header = rows.shift();
  return rows
    .filter((r) => r.length === header.length)
    .map((r) => Object.fromEntries(header.map((h, i) => [h, r[i]])));
}
const date = (s) => `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
const time = (s) => {
  if (!/^\d{2}:\d{2}:\d{2}$/.test(s)) throw new Error(`Invalid time: ${s}`);
  const [h, m, sec] = s.split(':').map(Number);
  if (m > 59 || sec !== 0 || h > 29) throw new Error(`Unsupported time: ${s}`);
  return h * 60 + m;
};
const lines = { 1: 'Asakusa', 2: 'Mita', 3: 'Shinjuku', 4: 'Oedo' };
const byCode = new Map(
  STATIONS.flatMap((s) =>
    (s.memberships || []).map((m) => [m.code, { station: s, membership: m }]),
  ),
);
const stops = {};
const bySource = new Map();
for (const row of csv('stops.txt')) {
  const match = byCode.get(row.stop_code);
  if (!match) continue;
  stops[row.stop_id] = {
    station: match.station.id,
    name: row.stop_name,
    line: match.membership.railwayId,
  };
  bySource.set(match.membership.sourceStationId, row.stop_id);
}
if (Object.keys(stops).length !== 106) throw new Error('Expected all 106 Toei line stations');
const trips = csv('trips.txt')
  .filter((t) => lines[t.route_id])
  .map((t) => ({
    id: t.trip_id,
    line: lines[t.route_id],
    service: t.service_id,
    headsign: t.trip_headsign,
    stops: [],
  }));
const byTrip = new Map(trips.map((t) => [t.id, t]));
const rows = csv('stop_times.txt').sort(
  (a, b) => Number(a.stop_sequence) - Number(b.stop_sequence),
);
for (const row of rows) {
  const trip = byTrip.get(row.trip_id);
  if (!trip) continue;
  if (!stops[row.stop_id]) throw new Error(`Unknown stop: ${row.stop_id}`);
  // Express trains include untimed pass-through rows; never invent a stop time.
  if (!row.arrival_time && !row.departure_time) continue;
  trip.stops.push([
    row.stop_id,
    time(row.arrival_time || row.departure_time),
    time(row.departure_time || row.arrival_time),
    (row.departure_time && ['', '0'].includes(row.pickup_type) ? 1 : 0) |
      (row.arrival_time && ['', '0'].includes(row.drop_off_type) ? 2 : 0),
  ]);
}
for (const trip of trips) {
  if (trip.stops.length < 2) throw new Error(`Incomplete trip ${trip.id}`);
  let previous = -1;
  for (const [, arrival, departure] of trip.stops) {
    if (arrival < previous || departure < arrival) throw new Error(`Non-monotonic trip ${trip.id}`);
    previous = departure;
  }
}
const prices = new Map(csv('fare_attributes.txt').map((f) => [f.fare_id, Number(f.price)]));
const fares = {};
for (const f of csv('fare_rules.txt')) {
  const from = stops[f.origin_id]?.station,
    to = stops[f.destination_id]?.station;
  if (!from || !to || from === to) continue;
  const key = fareKey(from, to),
    price = prices.get(f.fare_id);
  if (!price || (fares[key] && fares[key] !== price)) throw new Error(`Ambiguous fare ${key}`);
  fares[key] = price;
}
const transfers = [];
for (const s of STATIONS) {
  for (const m of s.memberships || []) {
    const from = bySource.get(m.sourceStationId);
    for (const sourceId of m.connectingStationIds) {
      const to = bySource.get(sourceId);
      if (from && to && from !== to)
        transfers.push({ from, to, minutes: s.id === 'kuramae' ? 10 : 8 });
    }
  }
}
// These are conservative app estimates, not official minimum transfer times.
for (const [from, a] of Object.entries(stops))
  for (const [to, b] of Object.entries(stops)) {
    if (
      from !== to &&
      a.station === b.station &&
      !transfers.some((t) => t.from === from && t.to === to)
    )
      transfers.push({ from, to, minutes: a.station === 'kuramae' ? 10 : 8 });
  }
const feed = csv('feed_info.txt')[0];
const weekdays = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const data = {
  version: 1,
  fetchedAt: (await stat(archivePath)).mtime.toISOString(),
  feedVersion: feed.feed_version,
  source,
  sourceSha256: createHash('sha256').update(archive).digest('hex'),
  provider: DATA_PROVIDER,
  license: DATA_LICENSE,
  startDate: date(feed.feed_start_date),
  endDate: date(feed.feed_end_date),
  // A new feed must be reviewed before lifting the known Asakusa cutover.
  lineEndDates: { Asakusa: ASAKUSA_CUTOVER },
  stops,
  calendars: csv('calendar.txt').map((c) => ({
    id: c.service_id,
    weekdays: weekdays.map((d, i) => (c[d] === '1' ? i : -1)).filter((i) => i >= 0),
    start: date(c.start_date),
    end: date(c.end_date),
  })),
  exceptions: csv('calendar_dates.txt').map((c) => ({
    service: c.service_id,
    date: date(c.date),
    added: c.exception_type === '1',
  })),
  trips,
  fares,
  transfers,
};
if (trips.length < 2000 || Object.keys(fares).length !== 4850)
  throw new Error(
    `Incomplete timetable or fare coverage: ${trips.length} trips, ${Object.keys(fares).length} fares`,
  );
for (const a of STATIONS)
  for (const b of STATIONS) {
    if (a.id === b.id || fareKey(a.id, b.id) === fareKey('higashinihombashi', 'bakuroyokoyama'))
      continue;
    if (!fares[fareKey(a.id, b.id)]) throw new Error(`Missing fare: ${a.id} → ${b.id}`);
  }
await mkdir('public/journey', { recursive: true });
await writeFile('public/journey/toei.json.tmp', JSON.stringify(data) + '\n');
try {
  await rename('public/journey/toei.json.tmp', 'public/journey/toei.json');
} catch (error) {
  // Windows Vite watchers can permit writing a file but prevent replacing it.
  if (process.platform !== 'win32' || error.code !== 'EPERM') throw error;
  await writeFile('public/journey/toei.json', JSON.stringify(data) + '\n');
  await unlink('public/journey/toei.json.tmp');
}
console.log(
  `Journey data: ${trips.length} trips, ${Object.keys(fares).length} fares, ${transfers.length} transfers; feed ${feed.feed_version}`,
);
