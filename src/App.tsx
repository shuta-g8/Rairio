import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import { stationDisplayName, lineName } from './lib/stations';
import { useStation } from './hooks/useStation';
import { useStationView } from './hooks/useStationView';
import { useOperations } from './hooks/useOperations';
import { useTrainPositions } from './hooks/useTrainPositions';
import { usePositionFeed } from './hooks/usePositionFeed';
import { useOffline } from './hooks/useOffline';
import { useInputMethod } from './hooks/useInputMethod';
import { useSavedStations } from './hooks/useSavedStations';
import { StationLink } from './components/StationLink';
import { StationDepartures } from './components/StationDepartures';
import { Timetable } from './components/Timetable';
import { Hero } from './components/hero/Hero';
import { LegalDialog, type LegalSection } from './components/layout/LegalDialog';
import { ConnectionStatus } from './components/layout/ConnectionStatus';
import { SiteFooter } from './components/layout/SiteFooter';
import { SiteHeader } from './components/layout/SiteHeader';
import { SavedStationTabs, StationRegistration } from './components/SavedStations';
import { Modal } from './components/Modal';
import { LoadingStatus } from './components/LoadingStatus';
import { StationSelectionNotice } from './components/StationSelectionNotice';
import { MAX_SAVED_STATIONS } from './lib/saved-stations';
import { dayKind, serviceDate } from './lib/time';

const JourneyPlanner = lazy(() =>
  import('./components/JourneyPlanner').then((m) => ({ default: m.JourneyPlanner })),
);

const positionFeedEnabled =
  import.meta.env.VITE_POSITION_SSE_ENABLED === undefined
    ? import.meta.env.MODE === 'public'
    : import.meta.env.VITE_POSITION_SSE_ENABLED === '1';

export default function App() {
  useInputMethod();
  const [view, setView] = useState<'departures' | 'journey'>(() =>
    window.location.hash === '#journey' ? 'journey' : 'departures',
  );
  const {
    stationId,
    nearby,
    station,
    chooseStation,
    selection,
    filter,
    filterDepartures,
    openRoute,
    openTimetable,
    closeTimetable,
  } = useStationView();
  const [legal, setLegal] = useState<LegalSection | null>(null);
  const [registrationOpen, setRegistrationOpen] = useState(false);
  const {
    savedStations,
    addStation,
    removeStation,
    change: savedStationChange,
  } = useSavedStations();
  const { refresh, ...stationData } = useStation(stationId);
  const operations = useOperations();
  const feed = usePositionFeed(
    positionFeedEnabled && view === 'departures',
    (stationData.data?.routes ?? []).filter(
      (route) => filter === 'all' || lineName(route.line) === filter,
    ),
  );
  const legacyPositions = useTrainPositions(
    !feed.active && !!stationData.data?.routes.some((route) => route.railwayId),
  );
  const trainPositions = feed.active ? feed.snapshot : legacyPositions;
  useEffect(() => {
    document.documentElement.dataset.positionTransport = feed.active ? feed.mode : 'polling';
  }, [feed.active, feed.mode]);
  useOffline();

  const showPrivacy = useCallback(() => setLegal('privacy'), []);
  const showLicenses = useCallback(() => setLegal('licenses'), []);
  const closeLegal = useCallback(() => setLegal(null), []);
  const showRegistration = useCallback(() => setRegistrationOpen(true), []);
  const closeRegistration = useCallback(() => setRegistrationOpen(false), []);
  const toggleCurrentStation = useCallback(() => {
    if (savedStations.includes(stationId)) removeStation(stationId);
    else if (savedStations.length < MAX_SAVED_STATIONS) addStation(stationId);
  }, [stationId, savedStations, addStation, removeStation]);
  const stationSaved = savedStations.includes(stationId);
  const stationSaveDisabled = !stationSaved && savedStations.length >= MAX_SAVED_STATIONS;
  const cancelLocation = nearby.cancel;
  const changeView = useCallback(
    (next: 'departures' | 'journey') => {
      cancelLocation();
      setView(next);
      const url = new URL(window.location.href);
      if (next === 'journey') url.hash = 'journey';
      else if (url.hash === '#journey') url.hash = '';
      window.history.replaceState(
        window.history.state,
        '',
        `${url.pathname}${url.search}${url.hash}`,
      );
    },
    [cancelLocation],
  );
  const navigateToStation = useCallback(
    (id: string) => {
      chooseStation(id);
      changeView('departures');
    },
    [chooseStation, changeView],
  );
  useEffect(() => {
    const followView = () => {
      cancelLocation();
      setView(window.location.hash === '#journey' ? 'journey' : 'departures');
    };
    window.addEventListener('popstate', followView);
    window.addEventListener('hashchange', followView);
    return () => {
      window.removeEventListener('popstate', followView);
      window.removeEventListener('hashchange', followView);
    };
  }, [cancelLocation]);

  return (
    <>
      <StationLink stationId={stationId} className="skip-link" onSelectStation={navigateToStation}>
        発車案内へスキップ
      </StationLink>
      <SiteHeader
        stationId={stationId}
        onStationSearch={nearby.cancel}
        nearby={nearby}
        changeStation={navigateToStation}
        savedStations={savedStations}
        onAddStation={addStation}
        onRemoveStation={removeStation}
      />
      <main>
        <Hero operations={operations} />
        <div className="page-shell">
          <ConnectionStatus online={operations.online} />
          <nav className="app-view-tabs" aria-label="案内の切り替え">
            <button
              type="button"
              aria-pressed={view === 'departures'}
              onClick={() => changeView('departures')}
            >
              発車案内
            </button>
            <button
              type="button"
              aria-pressed={view === 'journey'}
              onClick={() => changeView('journey')}
            >
              経路・乗換案内
            </button>
          </nav>
          {view === 'journey' && (
            <Suspense fallback={<LoadingStatus>経路案内を読み込んでいます…</LoadingStatus>}>
              <JourneyPlanner
                stationId={stationId}
                onManualInput={nearby.cancel}
                nearby={nearby}
                selectedStationData={stationData.data}
                positions={trainPositions}
              />
            </Suspense>
          )}
          <div hidden={view !== 'departures'}>
            <StationDepartures
              active={view === 'departures'}
              station={station}
              stationSaved={stationSaved}
              stationSaveDisabled={stationSaveDisabled}
              onToggleSave={toggleCurrentStation}
              {...stationData}
              filter={filter}
              onFilter={filterDepartures}
              onRefresh={refresh}
              onOpen={openTimetable}
              operations={operations}
              trainPositions={trainPositions}
            >
              <SavedStationTabs
                stationId={stationId}
                savedStations={savedStations}
                onSelect={navigateToStation}
                onAdd={addStation}
                onManage={showRegistration}
              />
            </StationDepartures>
          </div>
          <SiteFooter onPrivacy={showPrivacy} onLicenses={showLicenses} />
        </div>
      </main>
      {openRoute && (
        <Timetable
          stationName={stationDisplayName(station)}
          route={stationData.data?.routes.find((route) => route.id === openRoute.id) ?? openRoute}
          initialDay={dayKind(serviceDate(new Date()))}
          onClose={closeTimetable}
        />
      )}
      {registrationOpen && (
        <Modal title="登録駅を編集" onClose={closeRegistration} className="registration-dialog">
          <StationRegistration
            stationId={stationId}
            savedStations={savedStations}
            onAdd={addStation}
            onRemove={removeStation}
          />
        </Modal>
      )}
      {legal && <LegalDialog section={legal} onClose={closeLegal} />}
      <StationSelectionNotice
        selection={selection}
        savedChange={savedStationChange}
        dataId={stationData.data?.id}
        loading={stationData.loading}
      />
    </>
  );
}
