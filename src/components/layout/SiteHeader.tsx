import { ArrowLeftIcon } from '@phosphor-icons/react/dist/csr/ArrowLeft';
import { ArrowUpRightIcon } from '@phosphor-icons/react/dist/csr/ArrowUpRight';
import { ListIcon } from '@phosphor-icons/react/dist/csr/List';
import { MagnifyingGlassIcon } from '@phosphor-icons/react/dist/csr/MagnifyingGlass';
import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { APP_NAME } from '../../lib/brand';
import { loadRecentStations, rememberRecentStation } from '../../lib/station-search-history';
import { useCompactHeader } from '../../hooks/useCompactHeader';
import { useHeaderAutoHide } from '../../hooks/useHeaderAutoHide';
import { Logo } from '../Logo';
import { StationPicker } from '../StationPicker';
import { StationDirectory } from '../StationDirectory';
import { StationRegistration } from '../SavedStations';
import { Modal } from '../Modal';
import { AboutContent } from './AboutContent';
import type { NearbyStation } from '../../hooks/useNearbyStation';

interface Props {
  stationId: string;
  onStationSearch: () => void;
  nearby: NearbyStation;
  changeStation: (id: string, railwayId?: string) => void;
  onRailwayBrowse: (id: string) => void;
  savedStations: string[];
  onAddStation: (id: string) => void;
  onRemoveStation: (id: string) => void;
}

export const SiteHeader = memo(function SiteHeader({
  stationId,
  onStationSearch,
  nearby,
  changeStation,
  onRailwayBrowse,
  savedStations,
  onAddStation,
  onRemoveStation,
}: Props) {
  const compact = useCompactHeader();
  const [panel, setPanel] = useState<'search' | 'directory' | 'menu' | 'about' | null>(null);
  const headerHidden = useHeaderAutoHide(compact && panel === null);
  const [recentStations, setRecentStations] = useState(loadRecentStations);
  const previousCompact = useRef(compact);
  useEffect(() => {
    if (previousCompact.current !== compact) {
      onStationSearch();
      setPanel(null);
    }
    previousCompact.current = compact;
  }, [compact, onStationSearch]);
  const closePanel = useCallback(() => {
    onStationSearch();
    setPanel(null);
  }, [onStationSearch]);
  const finishLocationSelection = useCallback(() => {
    setPanel(null);
    requestAnimationFrame(() => {
      const target =
        document.querySelector<HTMLElement>('.journey-form input') ??
        document.getElementById('departures');
      target?.focus({ preventScroll: true });
    });
  }, []);
  const chooseStation = useCallback(
    (id: string, railwayId?: string) => {
      changeStation(id, railwayId);
      setPanel(null);
      requestAnimationFrame(() => {
        const focused = document.activeElement;
        if (focused instanceof HTMLInputElement) return;
        // A later user action owns focus even if this frame was delayed.
        if (
          focused instanceof HTMLElement &&
          focused !== document.body &&
          !focused.closest('.station-picker, .header-search-button')
        )
          return;
        const departures = document.getElementById('departures');
        departures?.focus({ preventScroll: true });
      });
    },
    [changeStation],
  );
  const rememberStation = useCallback(
    (id: string) => {
      setRecentStations(rememberRecentStation(id, recentStations));
    },
    [recentStations],
  );
  const picker = (
    <StationPicker
      changeStation={chooseStation}
      onOpenDirectory={() => setPanel('directory')}
      recentStations={recentStations}
      onRememberStation={rememberStation}
      onInteraction={onStationSearch}
      nearby={nearby}
      onLocationSelected={finishLocationSelection}
    />
  );
  return (
    <>
      <header className="site-header" data-scroll-hidden={headerHidden ? '' : undefined}>
        <div className="header-inner">
          <a className="brand" href={import.meta.env.BASE_URL} aria-label={`${APP_NAME} ホーム`}>
            <span className="brand-word">
              <Logo decorative edition />
            </span>
          </a>
          {!compact && <div className="header-search">{picker}</div>}
          <nav className="header-navigation" aria-label="メインナビゲーション">
            {compact ? (
              <>
                <button
                  type="button"
                  className="header-icon-button header-search-button"
                  aria-label="駅を検索"
                  aria-haspopup="dialog"
                  aria-expanded={panel === 'search' || panel === 'directory'}
                  onClick={(event) => {
                    event.currentTarget.focus({ preventScroll: true });
                    setPanel('search');
                  }}
                >
                  <MagnifyingGlassIcon size={21} aria-hidden="true" />
                </button>
                <button
                  type="button"
                  className="header-icon-button"
                  aria-label="メニューを開く"
                  aria-haspopup="dialog"
                  aria-expanded={panel === 'menu' || panel === 'about'}
                  onClick={(event) => {
                    event.currentTarget.focus({ preventScroll: true });
                    setPanel('menu');
                  }}
                >
                  <ListIcon size={23} aria-hidden="true" />
                </button>
              </>
            ) : (
              <>
                <button type="button" className="text-button" onClick={() => setPanel('about')}>
                  このアプリについて
                  <ArrowUpRightIcon size={14} aria-hidden="true" />
                </button>
              </>
            )}
          </nav>
        </div>
      </header>
      {panel === 'about' && !compact ? (
        <Modal
          title="このアプリについて"
          onClose={() => setPanel(null)}
          mobileCloseLabel="説明を閉じる"
        >
          <AboutContent />
        </Modal>
      ) : (
        panel && (
          <Modal
            title={
              panel === 'about'
                ? 'このアプリについて'
                : panel === 'menu'
                  ? 'メニュー'
                  : panel === 'directory'
                    ? '路線・駅名を選択する'
                    : '駅名で検索'
            }
            onClose={closePanel}
            initialFocus={
              panel === 'search'
                ? '#station-search'
                : panel === 'about'
                  ? '#header-menu-back'
                  : panel === 'menu'
                    ? '#header-about-button'
                    : undefined
            }
            wide={panel === 'directory'}
            className={
              panel === 'directory'
                ? 'station-directory-dialog'
                : `header-panel ${panel === 'menu' || panel === 'about' ? 'header-menu-panel' : 'header-search-panel'}`
            }
            mobileCloseLabel={panel === 'directory' ? '駅一覧を閉じる' : undefined}
          >
            {panel === 'directory' ? (
              <StationDirectory
                stationId={stationId}
                onRailwayBrowse={onRailwayBrowse}
                changeStation={chooseStation}
              />
            ) : panel === 'search' ? (
              picker
            ) : (
              <>
                {panel === 'about' && (
                  <>
                    <button
                      id="header-menu-back"
                      type="button"
                      className="header-menu-back"
                      onClick={() => setPanel('menu')}
                    >
                      <ArrowLeftIcon size={18} aria-hidden="true" />
                      メニューに戻る
                    </button>
                    <AboutContent />
                  </>
                )}
                <div className="header-menu-content" hidden={panel === 'about'}>
                  <StationRegistration
                    stationId={stationId}
                    savedStations={savedStations}
                    onAdd={onAddStation}
                    onRemove={onRemoveStation}
                  />
                  <button
                    type="button"
                    id="header-about-button"
                    className="header-about-button text-button"
                    onClick={() => setPanel('about')}
                  >
                    このアプリについて
                    <ArrowUpRightIcon size={17} aria-hidden="true" />
                  </button>
                </div>
              </>
            )}
          </Modal>
        )
      )}
    </>
  );
});
