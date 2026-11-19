import { useCallback, useEffect, useState } from 'react';
import { loadPreferredStation, savePreferredStation } from '../lib/station-preference';
import { stationFromSearch, stationUrl } from '../lib/station-url';
import { useNearbyStation } from './useNearbyStation';

function stationFromLocation() {
  return stationFromSearch(window.location.search) ?? loadPreferredStation();
}

export function useStationNavigation(onNavigate: () => void) {
  const [stationId, setStationId] = useState(stationFromLocation);
  const [automaticLocation] = useState(() => !stationFromSearch(window.location.search));

  const navigate = useCallback(
    (id: string, mode: 'push' | 'replace') => {
      const url = stationUrl(id, window.location.href);
      const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
      if (url !== current) {
        window.history[mode === 'replace' ? 'replaceState' : 'pushState'](
          window.history.state,
          '',
          url,
        );
      }
      setStationId(id);
      savePreferredStation(id);
      onNavigate();
    },
    [onNavigate],
  );

  const chooseNearby = useCallback((id: string) => navigate(id, 'replace'), [navigate]);
  const nearby = useNearbyStation(chooseNearby, automaticLocation);
  const cancelNearby = nearby.cancel;
  const changeStation = useCallback(
    (id: string) => {
      cancelNearby();
      navigate(id, 'push');
    },
    [navigate, cancelNearby],
  );

  useEffect(() => {
    const followUrl = () => {
      cancelNearby();
      navigate(stationFromLocation(), 'replace');
    };
    // Include the station in the first entry, so Back restores that entry's
    // station rather than reading the preference saved by a later selection.
    navigate(stationFromLocation(), 'replace');
    window.addEventListener('popstate', followUrl);
    return () => window.removeEventListener('popstate', followUrl);
  }, [navigate, cancelNearby]);

  return { stationId, changeStation, nearby };
}
