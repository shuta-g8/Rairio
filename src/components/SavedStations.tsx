import { memo, useState } from 'react';
import { BookmarkSimpleIcon } from '@phosphor-icons/react/dist/csr/BookmarkSimple';
import { PlusIcon } from '@phosphor-icons/react/dist/csr/Plus';
import { SlidersHorizontalIcon } from '@phosphor-icons/react/dist/csr/SlidersHorizontal';
import { MAX_SAVED_STATIONS } from '../lib/saved-stations';
import { findStation, stationDisplayName } from '../lib/stations';
import { StationLink } from './StationLink';

interface Props {
  stationId: string;
  savedStations: string[];
}

export const SavedStationTabs = memo(function SavedStationTabs({
  stationId,
  savedStations,
  onSelect,
  onAdd,
  onManage,
}: Props & { onSelect: (id: string) => void; onAdd: (id: string) => void; onManage: () => void }) {
  return (
    <nav className="saved-stations" aria-label="登録した駅">
      <span className="saved-stations-label">
        <BookmarkSimpleIcon size={15} aria-hidden="true" />
        登録駅
      </span>
      <div className="saved-stations-list">
        {savedStations.map((id) => (
          <StationLink
            key={id}
            stationId={id}
            scrollToDepartures={false}
            aria-current={stationId === id ? 'page' : undefined}
            onSelectStation={onSelect}
          >
            {stationDisplayName(findStation(id)!)}
          </StationLink>
        ))}
        {!savedStations.length && (
          <button type="button" className="saved-stations-empty" onClick={() => onAdd(stationId)}>
            <PlusIcon size={15} aria-hidden="true" />
            駅を登録
          </button>
        )}
      </div>
      <button
        type="button"
        className="saved-stations-manage"
        onClick={onManage}
        aria-label="登録駅を編集"
      >
        <SlidersHorizontalIcon size={17} aria-hidden="true" />
      </button>
    </nav>
  );
});

export const StationRegistration = memo(function StationRegistration({
  stationId,
  savedStations,
  onAdd,
  onRemove,
}: Props & { onAdd: (id: string) => void; onRemove: (id: string) => void }) {
  const full = savedStations.length >= MAX_SAVED_STATIONS;
  const [sessionStations, setSessionStations] = useState(savedStations);
  const stationIds = [
    stationId,
    ...new Set([...sessionStations, ...savedStations].filter((id) => id !== stationId)),
  ];
  return (
    <section className="station-registration" aria-label="駅の登録">
      <div className="registration-heading">
        <h3>
          <BookmarkSimpleIcon size={17} aria-hidden="true" />
          登録駅
        </h3>
        <span>
          {savedStations.length} / {MAX_SAVED_STATIONS}
        </span>
      </div>
      <ul className="registration-stations">
        {stationIds.map((id) => {
          const registered = savedStations.includes(id);
          const current = id === stationId;
          return (
            <li
              key={id}
              className={`registration-station${current ? ' registration-current' : ''}`}
            >
              <div>
                <small className={current ? 'registration-current-label' : undefined}>
                  {current ? '表示中の駅' : registered ? '登録済みの駅' : '登録解除済み'}
                </small>
                <strong>
                  {stationDisplayName(findStation(id)!)}
                  <small>駅</small>
                </strong>
              </div>
              <button
                type="button"
                className="registration-toggle"
                aria-pressed={registered}
                disabled={!registered && full}
                onClick={() => {
                  if (registered) onRemove(id);
                  else {
                    setSessionStations((ids) => (ids.includes(id) ? ids : [...ids, id]));
                    onAdd(id);
                  }
                }}
              >
                <BookmarkSimpleIcon
                  size={16}
                  weight={registered ? 'fill' : 'regular'}
                  aria-hidden="true"
                />
                {registered
                  ? '登録を解除'
                  : sessionStations.includes(id)
                    ? '再登録'
                    : 'この駅を登録'}
              </button>
            </li>
          );
        })}
      </ul>
      <p className="registration-note" role="status">
        {full
          ? '登録は5駅までです。駅を入れ替えるには、先に登録を解除してください。'
          : '最大5駅まで保存できます。'}
      </p>
    </section>
  );
});
