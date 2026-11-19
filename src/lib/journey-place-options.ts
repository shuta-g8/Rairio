import {
  exactJourneyPlace,
  findJourneyPlace,
  normalizeJourneyPlace,
  searchJourneyPlaces,
} from './journey-place-search.ts';

type Place = NonNullable<ReturnType<typeof findJourneyPlace>>;
export type JourneyPlaceOption =
  { kind: 'station' | 'nearby'; place: Place } | { kind: 'locate' | 'refresh' };

/** Keyboard selection and rendering share the same ordering, including location actions. */
export function journeyPlaceOptions(
  query: string,
  recent: readonly string[],
  location?: { stationId?: string },
): JourneyPlaceOption[] {
  const searching = Boolean(normalizeJourneyPlace(query));
  const places = searching
    ? searchJourneyPlaces(query)
    : recent.flatMap((id) => {
        const place = findJourneyPlace(id);
        return place ? [place] : [];
      });
  const nearby =
    !searching && location?.stationId ? findJourneyPlace(location.stationId) : undefined;
  const actions: JourneyPlaceOption[] =
    searching || !location
      ? []
      : nearby
        ? [{ kind: 'nearby', place: nearby }, { kind: 'refresh' }]
        : [{ kind: 'locate' }];
  return [
    ...actions,
    ...places
      .filter((place) => place.id !== nearby?.id)
      .map((place) => ({ kind: 'station' as const, place })),
  ];
}

export function defaultJourneyPlace(query: string, options: readonly JourneyPlaceOption[]) {
  const stations = options.flatMap((option) => (option.kind === 'station' ? [option.place] : []));
  return exactJourneyPlace(query) ?? (stations.length === 1 ? stations[0] : undefined);
}
