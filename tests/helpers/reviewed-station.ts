import fs from 'node:fs';
import {
  validateTimetableManifest,
  verifyEditionAsset,
  managesTimetable,
} from '../../shared/timetable-editions.ts';
import type { StationData } from '../../src/types.ts';
/** Tests that call pure departure functions start with the same verified data
 * that fetchStation supplies in the browser, rather than trusting raw JSON. */
export async function reviewedStation(id: string): Promise<StationData> {
  const data: StationData = JSON.parse(fs.readFileSync(`public/data/${id}.json`, 'utf8'));
  const manifest = validateTimetableManifest(
    JSON.parse(fs.readFileSync('shared/asakusa-timetable-manifest.json', 'utf8')),
  );
  // These regression inputs represent dates before Nov21; keep their old
  // edition explicit even after a real new edition is published.
  for (const release of manifest.releases.filter((r) => r.id === 'asakusa-pre-2026-11-21')) {
    const ref = release.stations[id];
    if (!ref) continue;
    const routes = await verifyEditionAsset(
      fs.readFileSync('public/' + ref.path, 'utf8'),
      manifest,
      release,
      id,
    );
    for (const route of data.routes.filter(managesTimetable)) {
      const verified = routes.find((r) => r.id === route.id)!;
      (route.timetableEditions ??= []).push({
        id: release.id,
        effectiveFrom: release.effectiveFrom,
        effectiveToExclusive: release.effectiveToExclusive,
        sha256: ref.routeHashes[route.id],
        schedules: verified.schedules,
      });
    }
  }
  return data;
}
export async function oldStationSnapshot(id: string): Promise<StationData> {
  const data = await reviewedStation(id);
  for (const route of data.routes.filter(managesTimetable)) {
    route.schedules = route.timetableEditions![0].schedules;
    delete route.timetableEditions;
    delete route.timetableUnavailable;
  }
  return data;
}
