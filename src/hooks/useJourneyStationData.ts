import { useEffect, useMemo, useState } from 'react';
import type { StationData } from '../types';
import { fetchStation } from '../lib/data';

/** Fetch boarding stations once per search, shared by all route candidates. */
export function useJourneyStationData(ids: readonly string[], selected?: StationData | null) {
  const [loaded, setLoaded] = useState<ReadonlyMap<string, StationData>>(new Map());
  const selectedId = selected?.id;
  useEffect(() => {
    const controller = new AbortController();
    for (const id of ids) {
      if (id === selectedId) continue;
      fetchStation(id, controller.signal)
        .then((station) => {
          if (!controller.signal.aborted) setLoaded((current) => new Map(current).set(id, station));
        })
        .catch(() => {
          /* Keep other displays working; never guess a train for a missing station. */
        });
    }
    return () => controller.abort();
  }, [ids, selectedId]);
  return useMemo(() => {
    const stations = new Map<string, StationData>();
    for (const id of ids) {
      const station = selected?.id === id ? selected : loaded.get(id);
      if (station) stations.set(id, station);
    }
    return stations;
  }, [ids, selected, loaded]);
}
