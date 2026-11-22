import { useEffect, useId, useState } from 'react';
import { RAILWAY_SYMBOLS } from '../lib/railway-symbols';
import { NETWORK_LINES, networkLineSymbol } from '../lib/kanto-network';
import { JOURNEY_LINES, type JourneyLine } from '../../shared/journey';
import { servesToeiSurfaceRail } from '../../shared/journey-online';
import { StationResultLines } from './StationResultLines';
import { NearbyStationOption } from './NearbyStationOption';
import type { NearbyStation } from '../hooks/useNearbyStation';
import {
  placeName,
  journeyPlaceName,
  normalizeJourneyPlace,
  exactJourneyPlace,
} from '../lib/journey-place-search';
import { defaultJourneyPlace, journeyPlaceOptions } from '../lib/journey-place-options';

export function JourneyPlaceSearch({
  label,
  value,
  onChange,
  recent = [],
  requiredError = false,
  nearby,
}: {
  label: string;
  value: string;
  onChange: (id: string) => void;
  recent?: string[];
  requiredError?: boolean;
  nearby?: NearbyStation;
}) {
  const id = useId();
  const [query, setQuery] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const needle = normalizeJourneyPlace(query ?? '');
  const options = journeyPlaceOptions(
    query ?? '',
    recent,
    nearby ? { stationId: nearby.locatedStationId } : undefined,
  );
  const locationIndex = options.findIndex(
    (option) => option.kind === 'nearby' || option.kind === 'locate',
  );
  const refreshIndex = options.findIndex((option) => option.kind === 'refresh');
  const locationOption = options[locationIndex];
  const locatedPlace = locationOption?.kind === 'nearby' ? locationOption.place : undefined;
  const showLocation = locationIndex >= 0;
  const stationOptions = options.flatMap((option, index) =>
    option.kind === 'station' ? [{ place: option.place, index }] : [],
  );
  const choiceCount = options.length;
  const hasDefaults = recent.length > 0 || Boolean(nearby);
  useEffect(() => {
    setActive((current) => Math.min(current, choiceCount - 1));
  }, [choiceCount]);
  useEffect(() => {
    if (open && active >= 0)
      document.getElementById(`${id}-${active}`)?.scrollIntoView({ block: 'nearest' });
  }, [open, active, id]);
  const select = (next: string) => {
    nearby?.cancel();
    onChange(next);
    setQuery(null);
    setOpen(false);
    setActive(-1);
  };
  const locate = () => {
    if (nearby?.status !== 'locating') nearby?.locate(select);
  };
  return (
    <div
      className="journey-place-search"
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) {
          const exact = query !== null ? exactJourneyPlace(query) : undefined;
          if (exact) onChange(exact.id);
          setOpen(false);
          setQuery(null);
        }
      }}
    >
      <label htmlFor={id}>
        {label}
        {requiredError && <span className="journey-required-badge">入力必須</span>}
      </label>
      <input
        id={id}
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls={open ? `${id}-list` : undefined}
        aria-activedescendant={open && active >= 0 ? `${id}-${active}` : undefined}
        value={query ?? placeName(value)}
        placeholder="駅名で検索"
        autoComplete="off"
        aria-required="true"
        aria-invalid={requiredError || undefined}
        aria-label={label}
        onClick={() => {
          if (query === null) setOpen(hasDefaults);
        }}
        onFocus={(e) => {
          setOpen(hasDefaults);
          setQuery(null);
          setActive(-1);
          e.currentTarget.select();
        }}
        onChange={(e) => {
          nearby?.cancel();
          setQuery(e.target.value);
          onChange('');
          setOpen(Boolean(e.target.value.trim()) || hasDefaults);
          setActive(-1);
        }}
        onKeyDown={(e) => {
          if (e.nativeEvent.isComposing || e.keyCode === 229) return;
          if (e.key === 'Escape') {
            e.preventDefault();
            setOpen(false);
            setQuery(null);
          }
          if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault();
            if (!choiceCount) return;
            setOpen(true);
            setActive((a) =>
              Math.max(0, Math.min(choiceCount - 1, a + (e.key === 'ArrowDown' ? 1 : -1))),
            );
          }
          if (e.key === 'Enter' && open) {
            e.preventDefault();
            const option = options[active];
            if (option) {
              if ('place' in option) select(option.place.id);
              else locate();
              return;
            }
            const match = defaultJourneyPlace(query ?? '', options);
            if (match) select(match.id);
          }
        }}
      />
      {open && (
        <div
          id={`${id}-list`}
          role="listbox"
          aria-label={`${label}の候補`}
          className="station-results journey-history-results"
        >
          {showLocation && nearby && (
            <NearbyStationOption
              locating={nearby.status === 'locating'}
              message={
                nearby.status === 'locating' || nearby.status === 'error' ? nearby.message : ''
              }
              stationName={locatedPlace ? journeyPlaceName(locatedPlace.name) : undefined}
              onLocate={locatedPlace ? () => select(locatedPlace.id) : locate}
              onRefresh={locatedPlace ? locate : undefined}
              option={{ id: `${id}-${locationIndex}`, selected: active === locationIndex }}
              refreshOption={
                refreshIndex >= 0
                  ? { id: `${id}-${refreshIndex}`, selected: active === refreshIndex }
                  : undefined
              }
            />
          )}
          {!needle && stationOptions.length > 0 && (
            <p className="station-results-heading">最近検索した駅</p>
          )}
          {stationOptions.length ? (
            stationOptions.map(({ place: p, index }) => (
              <button
                type="button"
                tabIndex={-1}
                key={p.id}
                id={`${id}-${index}`}
                role="option"
                aria-selected={active === index}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => select(p.id)}
              >
                <span>
                  <span>{journeyPlaceName(p.name)}</span>
                  <small>駅</small>
                  <StationResultLines
                    lines={p.lines.map((line) => {
                      if (line.startsWith('network:')) {
                        const networkId = line.slice(8);
                        return {
                          id: line,
                          name: NETWORK_LINES.get(networkId)?.name ?? '',
                          symbol: servesToeiSurfaceRail([networkId])
                            ? networkLineSymbol(networkId)
                            : undefined,
                        };
                      }
                      return {
                        id: line,
                        name:
                          JOURNEY_LINES[line.slice(5) as JourneyLine]?.name.replace(/^都営/, '') ??
                          '',
                        symbol: RAILWAY_SYMBOLS[line],
                      };
                    })}
                  />
                </span>
              </button>
            ))
          ) : !showLocation ? (
            <p>該当する駅がありません。</p>
          ) : null}
        </div>
      )}
    </div>
  );
}
