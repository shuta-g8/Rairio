import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { PathIcon } from '@phosphor-icons/react/dist/csr/Path';
import { TrainIcon } from '@phosphor-icons/react/dist/csr/Train';
import { stationDisplayName, lineName } from './lib/stations';
import { useStation } from './hooks/useStation';
import { useStationView } from './hooks/useStationView';
import { useOperations } from './hooks/useOperations';
import { useTrainPositions } from './hooks/useTrainPositions';
import { usePositionFeed } from './hooks/usePositionFeed';
import { useStationBoardPlans } from './hooks/useStationBoardPlans';
import { useOffline } from './hooks/useOffline';
import { useInputMethod } from './hooks/useInputMethod';
import { useSavedStations } from './hooks/useSavedStations';
import { StationLink } from './components/StationLink';
import { StationDepartures } from './components/StationDepartures';
import { Timetable } from './components/Timetable';
import { Hero } from './components/hero/Hero';
import { ConnectionStatus } from './components/layout/ConnectionStatus';
import { SiteFooter } from './components/layout/SiteFooter';
import { SiteHeader } from './components/layout/SiteHeader';
import { SavedStationTabs, StationRegistration } from './components/SavedStations';
import { Modal } from './components/Modal';
import { LoadingStatus } from './components/LoadingStatus';
import { StationSelectionNotice } from './components/StationSelectionNotice';
import { MAX_SAVED_STATIONS } from './lib/saved-stations';
import { dayKind, serviceDate } from './lib/time';
import { editionServiceDate } from '../shared/timetable-editions';
import { departureBoardRevision } from '../shared/departure-board';
import { loadBoardMode, saveBoardMode, type BoardMode } from './lib/board-mode';
import {
  departureDiagnosticsEnabled,
  earlyApproachEndEnabled,
  readDeparturePolicy,
} from './lib/departure-policy';
import type { Route } from './types';

const JourneyPlanner = lazy(() =>
  import('./components/JourneyPlanner').then((m) => ({ default: m.JourneyPlanner })),
);

const positionFeedEnabled =
  import.meta.env.VITE_POSITION_SSE_ENABLED === undefined
    ? import.meta.env.MODE === 'public'
    : import.meta.env.VITE_POSITION_SSE_ENABLED === '1';
const departureBoardEnabled =
  import.meta.env.VITE_DEPARTURE_BOARD_ENABLED === undefined
    ? import.meta.env.MODE === 'public'
    : import.meta.env.VITE_DEPARTURE_BOARD_ENABLED === '1';

function usesServerDepartureBoard() {
  if (
    readDeparturePolicy() !== 'hybrid' ||
    !earlyApproachEndEnabled() ||
    departureDiagnosticsEnabled()
  )
    return false;
  try {
    return sessionStorage.getItem('rairio:position-display') !== 'legacy';
  } catch {
    return true;
  }
}

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
  const [registrationOpen, setRegistrationOpen] = useState(false);
  const {
    savedStations,
    addStation,
    removeStation,
    change: savedStationChange,
  } = useSavedStations();
  const [useServerBoard] = useState(usesServerDepartureBoard);
  const [boardMode, setBoardMode] = useState(loadBoardMode);
  const changeBoardMode = useCallback((mode: BoardMode) => {
    setBoardMode(mode);
    saveBoardMode(mode);
  }, []);
  const plan = useStationBoardPlans(
    stationId,
    departureBoardEnabled && useServerBoard && view === 'departures',
  );
  const serverDate = plan.now && editionServiceDate(plan.now.getTime());
  const { refresh, ...stationData } = useStation(stationId, serverDate);
  const operations = useOperations();
  const data = stationData.data?.id === stationId ? stationData.data : null;
  const visibleRoutes = useMemo(
    () =>
      (data?.routes ?? []).filter((route) => filter === 'all' || lineName(route.line) === filter),
    [data, filter],
  );
  const [verified, setVerified] = useState<{
    stationId: string;
    date: string;
    revisions: Map<Route, string | undefined>;
  }>();
  useEffect(() => {
    if (!data || !serverDate) return;
    let active = true;
    const at = Date.parse(`${serverDate}T04:00:00+09:00`);
    void Promise.all(
      data.routes.map(async (route) => [route, await departureBoardRevision(route, at)] as const),
    )
      .then((entries) => {
        if (active)
          setVerified({ stationId: data.id, date: serverDate, revisions: new Map(entries) });
      })
      .catch(() => {
        if (active) setVerified(undefined);
      });
    return () => {
      active = false;
    };
  }, [data, serverDate]);
  const serverBoards = Object.fromEntries(
    verified?.stationId === stationId && verified.date === serverDate
      ? visibleRoutes.flatMap((route) => {
          const board = plan.routes[route.id];
          return board && verified.revisions.get(route) === board.revision
            ? [[route.id, board] as const]
            : [];
        })
      : [],
  );
  const hasServerBoards =
    visibleRoutes.length > 0 && visibleRoutes.every((route) => serverBoards[route.id]);
  const feed = usePositionFeed(
    positionFeedEnabled && view === 'departures' && !hasServerBoards,
    visibleRoutes,
  );
  // Passing and terminating trains are outside a station's departure subscription.
  const unscopedPositions = useTrainPositions(
    view === 'departures' &&
      (boardMode === 'toei' || (!hasServerBoards && !feed.active)) &&
      visibleRoutes.some((route) => route.railwayId),
  );
  const trainPositions = hasServerBoards ? null : feed.active ? feed.snapshot : unscopedPositions;
  useEffect(() => {
    document.documentElement.dataset.positionTransport = hasServerBoards
      ? 'server'
      : feed.active
        ? feed.mode
        : 'polling';
  }, [hasServerBoards, feed.active, feed.mode]);
  useOffline();

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
  function selectView(next: typeof view) {
    changeView(next);
    if (window.matchMedia('(max-width: 760px)').matches) {
      document.getElementById('app-view-content')?.scrollIntoView({ block: 'start' });
    }
  }
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
              onClick={() => selectView('departures')}
            >
              <TrainIcon size={20} aria-hidden="true" />
              発車案内
            </button>
            <button
              type="button"
              aria-pressed={view === 'journey'}
              onClick={() => selectView('journey')}
            >
              <PathIcon size={20} aria-hidden="true" />
              経路案内
            </button>
          </nav>
          <div id="app-view-content" className="app-view-content">
            {view === 'journey' && (
              <Suspense fallback={<LoadingStatus>経路案内を読み込んでいます…</LoadingStatus>}>
                <JourneyPlanner
                  stationId={stationId}
                  onManualInput={nearby.cancel}
                  nearby={nearby}
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
                specialPositions={boardMode === 'toei' ? unscopedPositions : undefined}
                boardMode={boardMode}
                onBoardModeChange={changeBoardMode}
                serverClock={plan.now}
                serverBoards={serverBoards}
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
          </div>
          <SiteFooter />
        </div>
      </main>
      {openRoute && (
        <Timetable
          stationName={stationDisplayName(station)}
          route={stationData.data?.routes.find((route) => route.id === openRoute.id) ?? openRoute}
          initialDay={dayKind(serviceDate(plan.now ?? new Date()))}
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
      <StationSelectionNotice
        selection={selection}
        savedChange={savedStationChange}
        dataId={stationData.data?.id}
        loading={stationData.loading}
      />
    </>
  );
}
