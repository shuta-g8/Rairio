import { STATIONS, type Station } from '../../shared/stations.ts';

export const NEARBY_STATION_RADIUS_METERS = 3000;
export const LOCATION_ACCURACY_LIMIT_METERS = 1000;

type Coordinates = Pick<GeolocationCoordinates, 'latitude' | 'longitude' | 'accuracy'>;
export type NearbyStationResult =
  | { kind: 'found'; station: Station; distanceMeters: number }
  | { kind: 'inaccurate' | 'far' | 'unavailable' };

function distanceMeters(lat1: number, lon1: number, lat2: number, lon2: number) {
  const rad = Math.PI / 180;
  const a =
    Math.sin(((lat2 - lat1) * rad) / 2) ** 2 +
    Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(((lon2 - lon1) * rad) / 2) ** 2;
  return 6371000 * 2 * Math.asin(Math.sqrt(Math.min(1, a)));
}

/** Compare locally against official station coordinates; no geocoding request is needed. */
export function nearbyToeiStation(
  { latitude, longitude, accuracy }: Coordinates,
  stations: readonly Station[] = STATIONS,
): NearbyStationResult {
  if (
    !Number.isFinite(latitude) ||
    Math.abs(latitude) > 90 ||
    !Number.isFinite(longitude) ||
    Math.abs(longitude) > 180 ||
    !Number.isFinite(accuracy) ||
    accuracy < 0
  )
    return { kind: 'unavailable' };
  if (accuracy > LOCATION_ACCURACY_LIMIT_METERS) return { kind: 'inaccurate' };
  let nearest: { station: Station; distanceMeters: number } | undefined;
  for (const station of stations) {
    for (const member of station.memberships ?? []) {
      if (!Number.isFinite(member.latitude) || !Number.isFinite(member.longitude)) continue;
      const distance = distanceMeters(latitude, longitude, member.latitude, member.longitude);
      if (!nearest || distance < nearest.distanceMeters)
        nearest = { station, distanceMeters: distance };
    }
  }
  return nearest && nearest.distanceMeters <= NEARBY_STATION_RADIUS_METERS
    ? { kind: 'found', ...nearest }
    : { kind: 'far' };
}
