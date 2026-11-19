import { useCallback, useState } from 'react';
import { findStation, stationRailwayId } from '../lib/stations';
import type { Route } from '../types';
import { useStationNavigation } from './useStationNavigation';

/** Keep station navigation, line selection, and its dialogs in one place. */
export function useStationView() {
  const [filter, setFilter] = useState('all');
  const [openRoute, setOpenRoute] = useState<Route | null>(null);
  const [selection, setSelection] = useState<{ id: string } | null>(null);
  const resetStationView = useCallback(() => {
    setFilter('all');
    setOpenRoute(null);
  }, []);
  const { stationId, changeStation, nearby } = useStationNavigation(resetStationView);
  const [browseRailwayId, setBrowseRailwayId] = useState(() => stationRailwayId(stationId));

  const chooseStation = useCallback(
    (id: string) => {
      changeStation(id);
      setSelection({ id });
    },
    [changeStation],
  );
  const closeTimetable = useCallback(() => setOpenRoute(null), []);

  return {
    stationId,
    nearby,
    station: findStation(stationId)!,
    browseRailwayId,
    setBrowseRailwayId,
    chooseStation,
    selection,
    filter,
    filterDepartures: setFilter,
    openRoute,
    openTimetable: setOpenRoute,
    closeTimetable,
  };
}
