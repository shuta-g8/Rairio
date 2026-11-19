import { BookmarkSimpleIcon } from '@phosphor-icons/react/dist/csr/BookmarkSimple';
import { memo } from 'react';
import type { Station } from '../types';
import { stationDisplayName } from '../lib/stations';
import { BoardModeSwitch } from './BoardModeSwitch';
import type { BoardMode } from '../lib/board-mode';

export const StationHeading = memo(function StationHeading({
  station,
  saved,
  saveDisabled,
  onToggleSave,
  boardMode,
  onBoardModeChange,
}: {
  station: Station;
  saved: boolean;
  saveDisabled: boolean;
  onToggleSave: () => void;
  boardMode: BoardMode;
  onBoardModeChange: (mode: BoardMode) => void;
}) {
  const name = stationDisplayName(station);
  return (
    <div className="station-heading-row">
      <div className="station-heading-main">
        <div className="station-title">
          <div className="station-name">
            <div className="station-name-row">
              <button
                type="button"
                className="station-bookmark"
                aria-label={`${name}駅${saved ? 'の登録を解除' : 'を登録'}`}
                aria-pressed={saved}
                disabled={saveDisabled}
                title={
                  saveDisabled
                    ? '最大5駅まで保存できます。登録済みの駅を解除してから追加してください。'
                    : undefined
                }
                onClick={onToggleSave}
              >
                <BookmarkSimpleIcon
                  size={27}
                  weight={saved ? 'fill' : 'regular'}
                  aria-hidden="true"
                />
              </button>
              <h2 id="station-heading" aria-label={`${name}駅`}>
                {station.name}
                {station.secondaryName && (
                  <span className="station-secondary-name">[{station.secondaryName}]</span>
                )}
                <small>駅</small>
              </h2>
            </div>
            <span className="station-english">{station.english}</span>
          </div>
        </div>
      </div>
      <BoardModeSwitch mode={boardMode} onChange={onBoardModeChange} />
    </div>
  );
});
