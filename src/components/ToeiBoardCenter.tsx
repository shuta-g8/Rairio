import { memo, useMemo, type ReactNode } from 'react';
import { useToeiBoardCycle } from '../hooks/useToeiBoardCycle';
import { useToeiGuidance } from '../hooks/useToeiGuidance';
import type { Departure, Route } from '../types';
import type { LineOperation } from '../../shared/railways';
import { toeiStopGuide } from '../lib/toei-stops';
import { ToeiBoardInformation, ToeiFixedInformation } from './ToeiBoardInformation';
import { ToeiStopDiagram } from './ToeiStopDiagram';
import { TOEI_CONTINUATIONS } from '../lib/toei-map-labels';
import type { ToeiObservedPosition } from '../lib/toei-position';
import { ToeiPositionIndicator } from './ToeiPositionIndicator';
import { toeiDiagramDirection } from '../lib/toei-diagram';
import { ToeiArrivalNotice } from './ToeiArrivalNotice';
import { toeiLastTrainMessage, toeiStopListMessage } from '../lib/toei-train-notices';
import { toeiWaitingNotice } from '../lib/toei-waiting-notices';
import { toeiDisplayLanguage } from '../lib/toei-language';

const STATIONS_PER_PAGE = 10;

/** Select route content; timing and interruption rules live in useToeiBoardCycle. */
export const ToeiBoardCenter = memo(function ToeiBoardCenter({
  route,
  train,
  nextRow,
  now,
  operation,
  previous,
  position,
  attention,
  possibleDelay,
  keepRowsVisible,
}: {
  route: Route;
  train?: Departure;
  nextRow?: ReactNode;
  now: Date;
  operation?: LineOperation;
  previous: boolean;
  position?: ToeiObservedPosition;
  attention: boolean;
  possibleDelay: boolean;
  keepRowsVisible: boolean;
}) {
  const guide = useMemo(
    () => train && toeiStopGuide(route, train),
    [route, train?.destination, train?.type, train?.gtfs],
  );
  const available = !keepRowsVisible && !!guide && (!operation || operation.state === 'normal');
  const stations = useMemo(() => (guide ? [...guide.preceding, ...guide.stations] : []), [guide]);
  const pages = Math.ceil(stations.length / STATIONS_PER_PAGE);
  const disruption = operation && operation.state !== 'normal' ? operation : undefined;
  const stopList = useMemo(
    () => (disruption ? undefined : toeiStopListMessage(guide)),
    [disruption, guide],
  );
  const fixedNotices = disruption
    ? []
    : [
        toeiWaitingNotice(route, train, now),
        guide && toeiLastTrainMessage(route, train, now),
      ].filter((notice) => notice !== undefined);
  const priorityKey =
    disruption || possibleDelay
      ? JSON.stringify([disruption?.state, disruption?.status, disruption?.message, possibleDelay])
      : undefined;
  const {
    kind,
    page,
    messageIndex,
    english,
    fixedNoticeStartedAt,
    fixedNoticeIndex,
    setFocused,
    completeInformation,
  } = useToeiBoardCycle({
    available,
    positionAvailable: !!position,
    attention,
    possibleDelay: possibleDelay && !keepRowsVisible,
    pages,
    now,
    priorityKey,
    fixedNoticeAvailable: fixedNotices.length > 0,
  });
  const visibleStations = useMemo(() => {
    const start = Math.min(
      page * STATIONS_PER_PAGE,
      Math.max(0, stations.length - STATIONS_PER_PAGE),
    );
    return stations.slice(start, start + STATIONS_PER_PAGE);
  }, [stations, page]);
  const singleNotice = available || (!priorityKey && fixedNotices.length > 0);
  const messages = useToeiGuidance(
    operation,
    previous,
    messageIndex,
    singleNotice,
    possibleDelay,
    stopList,
  );
  const information = (
    <ToeiBoardInformation
      messages={messages}
      continuous={!priorityKey && !singleNotice && messageIndex === 0 && messages.length > 1}
      onFocusChange={setFocused}
      onCycleComplete={completeInformation}
    />
  );
  const direction = toeiDiagramDirection(route);
  const lastPage = page === pages - 1;
  const continuation =
    guide?.through && lastPage ? TOEI_CONTINUATIONS[route.id.replace(/^Toei\./, '')] : undefined;
  if (attention && keepRowsVisible)
    return (
      <>
        <ToeiArrivalNotice compact />
        {nextRow}
      </>
    );
  if (attention)
    return (
      <>
        {possibleDelay && information}
        <ToeiArrivalNotice />
      </>
    );
  if (kind === 'fixed-notice' && fixedNoticeStartedAt !== undefined && fixedNotices.length) {
    const notice = fixedNotices[fixedNoticeIndex % fixedNotices.length];
    const requested = toeiDisplayLanguage(
      new Date(Math.max(0, now.getTime() - fixedNoticeStartedAt)),
    );
    const language = 'translations' in notice && notice.translations[requested] ? requested : 'ja';
    const message =
      'translations' in notice
        ? {
            id: notice.id,
            segments: [{ text: notice.translations[language]!, tone: 'white' as const }],
          }
        : notice;
    return (
      <>
        <ToeiFixedInformation key={message.id} message={message} language={language} />
        {nextRow}
      </>
    );
  }
  return kind === 'diagram' && guide ? (
    <ToeiStopDiagram
      stations={visibleStations}
      railwayId={route.railwayId!}
      terminalVisible={!guide.through && lastPage}
      english={english}
      direction={direction}
      continuation={continuation}
      meguroLocalSection={continuation && guide.meguroLocalSection}
    />
  ) : (
    <>
      {kind === 'position' && position ? (
        <ToeiPositionIndicator position={position} direction={direction} />
      ) : (
        information
      )}
      {nextRow}
    </>
  );
});
