import { useCallback, useEffect, useRef, useState } from 'react';
import { addSavedStation, loadSavedStations, storeSavedStations } from '../lib/saved-stations';

export type SavedStationChange = { id: string; action: 'saved' | 'removed' };

export function useSavedStations() {
  const [savedStations, setSavedStations] = useState(loadSavedStations);
  const previous = useRef(savedStations);
  const [change, setChange] = useState<SavedStationChange | null>(null);
  useEffect(() => {
    const added = savedStations.find((id) => !previous.current.includes(id));
    const removed = previous.current.find((id) => !savedStations.includes(id));
    previous.current = savedStations;
    if (added) setChange({ id: added, action: 'saved' });
    else if (removed) setChange({ id: removed, action: 'removed' });
  }, [savedStations]);
  useEffect(() => storeSavedStations(savedStations), [savedStations]);
  const addStation = useCallback((id: string) => {
    setSavedStations((current) => addSavedStation(current, id));
  }, []);
  const removeStation = useCallback((id: string) => {
    setSavedStations((current) =>
      current.includes(id) ? current.filter((stationId) => stationId !== id) : current,
    );
  }, []);
  return { savedStations, addStation, removeStation, change };
}
