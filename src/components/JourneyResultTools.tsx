import { PlusIcon } from '@phosphor-icons/react/dist/csr/Plus';
import type { JourneySort } from '../lib/journey-sort';

export const journeyResultsPerPage = 3;

export function JourneyMoreResults({
  shown,
  total,
  onShowMore,
}: {
  shown: number;
  total: number;
  onShowMore: () => void;
}) {
  return (
    shown < total && (
      <button type="button" className="journey-more-results" onClick={onShowMore}>
        <PlusIcon size={18} aria-hidden="true" />
        さらに表示する
      </button>
    )
  );
}

export function JourneyResultTools({
  sort,
  onSort,
  onFares,
  fareDisabled,
  fareLabel = '運賃を表示',
}: {
  sort: JourneySort;
  onSort: (sort: JourneySort) => void;
  onFares: () => void;
  fareDisabled: boolean;
  fareLabel?: string;
}) {
  return (
    <div className="journey-result-tools">
      <label>
        並び替え
        <select value={sort} onChange={(event) => onSort(event.target.value as JourneySort)}>
          <option value="arrival">到着が早い順</option>
          <option value="toei">都営線優先</option>
        </select>
      </label>
      <button
        type="button"
        className="journey-show-fares"
        onClick={onFares}
        disabled={fareDisabled}
      >
        {fareLabel}
      </button>
    </div>
  );
}
