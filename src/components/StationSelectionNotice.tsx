import { CheckCircleIcon } from '@phosphor-icons/react/dist/csr/CheckCircle';
import { memo, useEffect, useRef, useState } from 'react';
import { findStation, stationDisplayName } from '../lib/stations';
import type { SavedStationChange } from '../hooks/useSavedStations';

const NOTICE_LABELS = {
  selected: 'を選択しました',
  saved: 'を保存しました',
  removed: 'の保存を解除しました',
};

export const StationSelectionNotice = memo(function StationSelectionNotice({
  selection,
  savedChange,
  dataId,
  loading,
}: {
  selection: { id: string } | null;
  savedChange: SavedStationChange | null;
  dataId?: string;
  loading: boolean;
}) {
  const handled = useRef(selection);
  const region = useRef<HTMLDivElement>(null);
  const [notice, setNotice] = useState<{
    id: string;
    action: 'selected' | 'saved' | 'removed';
    source: object;
  } | null>(null);
  useEffect(() => {
    if (!selection || handled.current === selection || loading || dataId !== selection.id) return;
    handled.current = selection;
    setNotice({ ...selection, action: 'selected', source: selection });
  }, [selection, dataId, loading]);
  useEffect(() => {
    if (savedChange) setNotice({ ...savedChange, source: savedChange });
  }, [savedChange]);
  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), 2200);
    return () => clearTimeout(timer);
  }, [notice]);
  const visible =
    !!notice &&
    (notice.action !== 'selected' ||
      (notice.source === selection && dataId === notice.id && !loading));
  useEffect(() => {
    if (visible) region.current?.showPopover?.();
    else region.current?.hidePopover?.();
  }, [visible, notice]);
  return (
    <div
      ref={region}
      popover="manual"
      className="station-notice-region"
      role="status"
      aria-live="polite"
      aria-atomic="true"
    >
      {visible && notice && (
        <div className="station-notice" key={notice.id}>
          <CheckCircleIcon size={18} aria-hidden="true" />
          <span>
            {stationDisplayName(findStation(notice.id)!)}駅{NOTICE_LABELS[notice.action]}
          </span>
        </div>
      )}
    </div>
  );
});
