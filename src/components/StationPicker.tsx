import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { MagnifyingGlassIcon } from '@phosphor-icons/react/dist/csr/MagnifyingGlass';
import { XIcon } from '@phosphor-icons/react/dist/csr/X';

import { STATION_RAILWAYS, findStation, stationDisplayName } from '../lib/stations';
import { searchStations } from '../lib/station-search';
import { RAILWAY_SYMBOLS } from '../lib/railway-symbols';
import { StationResultLines } from './StationResultLines';
import { NearbyStationOption } from './NearbyStationOption';
import type { NearbyStation } from '../hooks/useNearbyStation';

interface Props {
  changeStation: (id: string, railwayId?: string) => void;
  onOpenDirectory: () => void;
  recentStations: string[];
  onRememberStation: (id: string) => void;
  onInteraction?: () => void;
  nearby: NearbyStation;
  onLocationSelected: () => void;
}

export const StationPicker = memo(function StationPicker({
  changeStation,
  onOpenDirectory,
  recentStations,
  onRememberStation,
  onInteraction,
  nearby,
  onLocationSelected,
}: Props) {
  const [query, setQuery] = useState('');
  const [focused, setFocused] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const { term, matches } = useMemo(() => searchStations(query), [query]);
  const showingRecent = !term && recentStations.length > 0;
  const results = useMemo(
    () => (term ? matches : recentStations.map((id) => findStation(id)!)),
    [term, matches, recentStations],
  );
  const showResults = focused;
  const locationRequested = useRef(false);
  useEffect(() => {
    if (!locationRequested.current) return;
    if (nearby.status === 'success') {
      locationRequested.current = false;
      input.current?.blur();
      setQuery('');
      setFocused(false);
      onLocationSelected();
    } else if (nearby.status === 'error' || nearby.status === 'idle') {
      locationRequested.current = false;
    }
  }, [nearby.status, onLocationSelected]);
  function chooseSearchResult(id: string) {
    onRememberStation(id);
    input.current?.blur();
    changeStation(id);
    setQuery('');
    setFocused(false);
  }
  return (
    <section className="station-picker" aria-label="駅の検索と選択" onFocusCapture={onInteraction}>
      <div className="station-picker-fields">
        <div
          className="station-search"
          onBlur={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false);
          }}
        >
          <label htmlFor="station-search">駅名で検索</label>
          <form
            className="station-search-field"
            role="search"
            onSubmit={(event) => {
              event.preventDefault();
              if (showResults && results.length) chooseSearchResult(results[0].id);
            }}
          >
            <MagnifyingGlassIcon size={18} aria-hidden="true" />
            <input
              ref={input}
              id="station-search"
              type="search"
              value={query}
              autoComplete="off"
              placeholder="駅名・よみ・英語で検索"
              aria-controls={showResults ? 'station-results' : undefined}
              onFocus={() => setFocused(true)}
              onClick={() => setFocused(true)}
              onChange={(event) => {
                onInteraction?.();
                setQuery(event.target.value);
                setFocused(true);
              }}
              onKeyDown={(event) => {
                if (event.key === 'Escape' && (query || showResults)) {
                  // A location-only list must not swallow the search dialog's Escape.
                  if (query || showingRecent) {
                    event.preventDefault();
                    event.stopPropagation();
                  }
                  setQuery('');
                  setFocused(false);
                }
              }}
            />
            {query && (
              <button
                type="button"
                aria-label="検索をクリア"
                onClick={() => {
                  setQuery('');
                  input.current?.focus();
                }}
              >
                <XIcon size={16} />
              </button>
            )}
          </form>
          {showResults && (
            <div id="station-results" className="station-results" aria-label="駅の検索候補">
              {!term && (
                <NearbyStationOption
                  locating={nearby.status === 'locating'}
                  message={nearby.message}
                  onLocate={() => {
                    locationRequested.current = true;
                    nearby.locate();
                  }}
                />
              )}
              {(showingRecent || term) && (
                <div aria-label={showingRecent ? '最近検索した駅' : '駅の検索結果'}>
                  {showingRecent && <p className="station-results-heading">最近検索した駅</p>}
                  {results.length ? (
                    <ul>
                      {results.map((station) => (
                        <li key={station.id}>
                          <button
                            type="button"
                            // Safari does not focus buttons on click; keep blur from removing the result first.
                            onMouseDown={(event) => event.preventDefault()}
                            onClick={() => chooseSearchResult(station.id)}
                          >
                            <span>
                              {stationDisplayName(station)}
                              <small>駅</small>
                              <StationResultLines
                                lines={(station.memberships || []).map((member) => ({
                                  id: member.railwayId,
                                  name:
                                    STATION_RAILWAYS.find(
                                      (line) => line.id === member.railwayId,
                                    )?.name.replace(/^都営/, '') || '',
                                  symbol: RAILWAY_SYMBOLS[`Toei.${member.railwayId}`],
                                }))}
                              />
                            </span>
                            <span>{station.english}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p role="status">一致する駅がありません。</p>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
        <span className="station-search-separator">または</span>
        <button
          type="button"
          className="station-directory-trigger"
          aria-haspopup="dialog"
          // Keep recent results in place until the click; blur would move this button on mobile.
          onMouseDown={(event) => event.preventDefault()}
          onClick={(event) => {
            onInteraction?.();
            setFocused(false);
            input.current?.blur();
            // Safari does not focus buttons on click; retain a return target for the dialog.
            event.currentTarget.focus({ preventScroll: true });
            onOpenDirectory();
          }}
        >
          路線・駅名を選択する
        </button>
      </div>
    </section>
  );
});
