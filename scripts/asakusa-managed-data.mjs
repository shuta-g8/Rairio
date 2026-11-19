import fs from 'node:fs';
import {
  validateTimetableManifest,
  releaseForDate,
  editionServiceDate,
  verifyEditionAsset,
} from '../shared/timetable-editions.ts';
/** The ordinary refresh may observe a future timetable early. Only the reviewed
 * immutable release is used for Asakusa; the other lines keep their generator. */
export async function managedAsakusaRoutes(at = Date.now()) {
  const manifest = validateTimetableManifest(
      JSON.parse(fs.readFileSync('shared/asakusa-timetable-manifest.json', 'utf8')),
    ),
    active = releaseForDate(manifest, editionServiceDate(at)),
    headerRelease = active ?? manifest.releases[0],
    routes = new Map();
  if (!headerRelease) throw Error('No reviewed Asakusa headers');
  for (const [station, ref] of Object.entries(headerRelease.stations)) {
    const rs = await verifyEditionAsset(
      fs.readFileSync('public/' + ref.path, 'utf8'),
      manifest,
      headerRelease,
      station,
    );
    routes.set(
      station,
      rs.map((r) =>
        active
          ? r
          : {
              ...r,
              schedules: { weekday: [], saturday: [], holiday: [] },
              timetableUnavailable: true,
            },
      ),
    );
  }
  return { manifest, active: active?.id ?? null, routes };
}
