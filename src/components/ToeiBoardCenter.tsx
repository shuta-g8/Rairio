import { memo, useMemo } from 'react';
import { useToeiBoardCycle } from '../hooks/useToeiBoardCycle';
import { useToeiGuidance } from '../hooks/useToeiGuidance';
import type { Departure, Route, Train } from '../types';
import type { LineOperation } from '../../shared/railways';
import { toeiStopGuide } from '../lib/toei-stops';
import { ToeiBoardInformation, ToeiPossibleDelayNotice } from './ToeiBoardInformation';
import { FlippingToeiDepartureRow } from './ToeiDepartureRow';
import { ToeiStopDiagram } from './ToeiStopDiagram';
import { TOEI_CONTINUATIONS } from '../lib/toei-map-labels';
import type { ToeiObservedPosition } from '../lib/toei-position';
import { ToeiPositionIndicator } from './ToeiPositionIndicator';
import { toeiDiagramDirection } from '../lib/toei-diagram';

const STATIONS_PER_PAGE = 10;

/** Select route content; timing and interruption rules live in useToeiBoardCycle. */
export const ToeiBoardCenter = memo(function ToeiBoardCenter({
  route,
  train,
  nextDepartures,
  now,
  operation,
  previous,
  position,
  possibleDelay,
}: {
  route: Route;
  train?: Train;
  nextDepartures: Departure[];
  now: Date;
  operation?: LineOperation;
  previous: boolean;
  position?: ToeiObservedPosition;
  possibleDelay: boolean;
}) {
  const guide = useMemo(
    () => train && toeiStopGuide(route, train),
    [route, train?.destination, train?.type, train?.gtfs],
  );
  const available = !!guide && (!operation || operation.state === 'normal');
  const stations = useMemo(() => (guide ? [...guide.preceding, ...guide.stations] : []), [guide]);
  const pages = Math.ceil(stations.length / STATIONS_PER_PAGE);
  const { kind, page, messageIndex, english, setFocused, completeInformation } = useToeiBoardCycle({
    available,
    positionAvailable: !!position,
    pages,
    now,
    priorityKey:
      operation && operation.state !== 'normal'
        ? JSON.stringify([operation.state, operation.status, operation.message])
        : undefined,
  });
  const visibleStations = useMemo(() => {
    const start = Math.min(
      page * STATIONS_PER_PAGE,
      Math.max(0, stations.length - STATIONS_PER_PAGE),
    );
    return stations.slice(start, start + STATIONS_PER_PAGE);
  }, [stations, page]);
  const messages = useToeiGuidance(operation, previous, messageIndex, available);
  const direction = toeiDiagramDirection(route);
  return !possibleDelay && kind === 'diagram' && guide ? (
    <ToeiStopDiagram
      stations={visibleStations}
      railwayId={route.railwayId!}
      through={guide.through}
      terminalVisible={!guide.through && page === pages - 1}
      english={english}
      direction={direction}
      continuation={
        guide.through && page === pages - 1
          ? TOEI_CONTINUATIONS[route.id.replace(/^Toei\./, '')]
          : undefined
      }
    />
  ) : (
    <>
      {possibleDelay ? (
        <ToeiPossibleDelayNotice />
      ) : kind === 'position' && position ? (
        <ToeiPositionIndicator position={position} direction={direction} />
      ) : (
        <ToeiBoardInformation
          messages={messages}
          continuous={!available && messageIndex === 0 && messages.length > 1}
          onFocusChange={setFocused}
          onCycleComplete={completeInformation}
        />
      )}
      {nextDepartures.map((departure, index) => (
        <FlippingToeiDepartureRow
          key={index}
          departure={departure}
          index={index + 1}
          now={now}
          route={route}
        />
      ))}
    </>
  );
});
