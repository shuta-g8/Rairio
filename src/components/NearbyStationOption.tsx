import { NavigationArrowIcon } from '@phosphor-icons/react/dist/csr/NavigationArrow';
import { ArrowsClockwiseIcon } from '@phosphor-icons/react/dist/csr/ArrowsClockwise';
import { useId } from 'react';

interface OptionState {
  id: string;
  selected: boolean;
}

export function NearbyStationOption({
  locating,
  message,
  onLocate,
  stationName,
  onRefresh,
  option,
  refreshOption,
}: {
  locating: boolean;
  message: string;
  onLocate: () => void;
  stationName?: string;
  onRefresh?: () => void;
  option?: OptionState;
  refreshOption?: OptionState;
}) {
  const messageId = useId();
  return (
    <div className="station-location-option">
      <div className="station-location-actions">
        <button
          id={option?.id}
          role={option ? 'option' : undefined}
          aria-selected={option?.selected}
          tabIndex={option ? -1 : undefined}
          aria-label={stationName ? `${stationName}駅（現在地付近）` : undefined}
          aria-describedby={message ? messageId : undefined}
          type="button"
          onMouseDown={(event) => event.preventDefault()}
          onClick={onLocate}
          disabled={locating}
        >
          <span>
            <NavigationArrowIcon size={18} aria-hidden="true" />
            {stationName ? `${stationName}駅` : '現在地から選択'}
          </span>
        </button>
        {onRefresh && (
          <button
            id={refreshOption?.id}
            role={refreshOption ? 'option' : undefined}
            aria-selected={refreshOption?.selected}
            tabIndex={refreshOption ? -1 : undefined}
            type="button"
            className="station-location-refresh"
            aria-label="現在地を再取得"
            onMouseDown={(event) => event.preventDefault()}
            onClick={onRefresh}
            disabled={locating}
          >
            <ArrowsClockwiseIcon size={16} aria-hidden="true" />
            <span>再取得</span>
          </button>
        )}
      </div>
      {message && (
        <p id={messageId} className="nearby-station-message" role="status" aria-live="polite">
          {message}
        </p>
      )}
    </div>
  );
}
