import type { Departure, Route } from '../types';
import type { BoardMode } from '../lib/board-mode';
import type { LineOperation } from '../../shared/railways';
import type { TrainPositionsSnapshot } from '../../shared/train-positions';
import { useLiveDepartures } from '../hooks/useLiveDepartures';
import { useDepartureBoardPreview } from '../hooks/useDepartureBoardPreview';
import { RouteCard } from './DepartureBoard';
import { ToeiDepartureBoard } from './ToeiDepartureBoard';
import {
  schedulesForDate,
  editionServiceDate,
  timetableEditionForDate,
} from '../../shared/timetable-editions';
import { TimetableUnavailable } from './TimetableUnavailable';
import { RailMark } from './RailMark';
import { lineName, lineSymbol } from '../lib/stations';
import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  collectedDiagramEstimate,
  matchedTrainPosition,
  statisticalArrivalTime,
} from '../lib/toei-position';
import type { DepartureBoardDisplay } from '../lib/live-departures';
import type { PositionEstimate } from '../../shared/position-estimate';
import { asakusaTrainType } from '../lib/asakusa-train-types';
import type { StationDepartureBoardDisplay } from '../../shared/departure-board';

function withTrainType(route: Route, departure: Departure, liveType?: string): Departure {
  if (!departure.gtfs) return departure;
  const type =
    liveType ||
    asakusaTrainType(
      timetableEditionForDate(route, departure.serviceDate),
      departure.day,
      departure,
    );
  return type ? { ...departure, type } : departure;
}

type BoardProps = {
  mode: BoardMode;
  route: Route;
  now: Date;
  positions?: TrainPositionsSnapshot | null;
  serverDisplay?: StationDepartureBoardDisplay;
  onOpen: () => void;
  operation?: LineOperation;
  previous: boolean;
};

export function StationDepartureBoard(props: BoardProps) {
  if (
    import.meta.env.DEV &&
    props.route.sourceStationId === 'odpt.Station:Toei.Oedo.Daimon' &&
    props.route.id === 'Toei.Oedo.OuterLoop' &&
    new URLSearchParams(window.location.search).get('departureBoard') === 'server'
  )
    return <ServerDepartureBoard {...props} />;
  return <LocalDepartureBoard {...props} />;
}

function ServerDepartureBoard({ mode, route, now, onOpen, operation, previous }: BoardProps) {
  const { display, pending, transport } = useDepartureBoardPreview(route.id, now);
  const Board = mode === 'toei' ? ToeiDepartureBoard : RouteCard;
  return (
    <div
      style={{ display: 'contents' }}
      data-departure-board-state={display ? 'server' : pending ? 'loading' : 'unavailable'}
      data-departure-board-transport={transport}
    >
      {display ? (
        <Board {...{ route, now, display, onOpen, operation, previous }} source="server" />
      ) : (
        <article className="route-card" aria-busy={pending}>
          <header>
            <RailMark color={route.color} symbol={lineSymbol(route.line)} />
            <h3>
              {lineName(route.line)} {route.direction}方面
            </h3>
          </header>
          <p role="status">
            {pending
              ? '発車案内を読み込み中です。'
              : '発車案内を受信できません。時刻表をご確認ください。'}
          </p>
          <button type="button" onClick={onOpen}>
            時刻表
          </button>
        </article>
      )}
    </div>
  );
}

/** Keep the live deadline across display-mode changes without retaining hidden boards. */
function LocalDepartureBoard({ mode, route, now, positions, serverDisplay, ...props }: BoardProps) {
  const schedules = schedulesForDate(route, editionServiceDate(now.getTime()));
  const scoped = useMemo(
    () => ({ ...route, schedules: schedules ?? { weekday: [], saturday: [], holiday: [] } }),
    [route, schedules],
  );
  const [legacyDiagram] = useState(() => {
    try {
      return sessionStorage.getItem('rairio:position-display') === 'legacy';
    } catch {
      return false;
    }
  });
  const localDisplay = useLiveDepartures(scoped, positions, now, !legacyDiagram, serverDisplay);
  const display = serverDisplay ?? localDisplay;
  const first = display.board.kind === 'active' ? display.board.departures[0] : undefined;
  const collectedMode =
    mode === 'toei' &&
    !first?.gtfs &&
    !legacyDiagram &&
    (!positions || positions.collected !== undefined);
  const trip = [
    route.sourceStationId,
    route.id,
    first?.serviceDate,
    first?.trainId,
    first?.timestamp,
  ].join('/');
  const last = useRef<{ trip: string; estimate?: PositionEstimate } | undefined>(undefined);
  const forecast =
    collectedMode && !('estimatedDiagram' in display) && positions && first
      ? collectedDiagramEstimate(
          scoped,
          first,
          positions,
          now,
          !!props.operation && props.operation.state !== 'normal',
          last.current?.trip === trip ? last.current.estimate : undefined,
        )
      : undefined;
  useLayoutEffect(() => {
    if (forecast || last.current?.trip !== trip)
      last.current = { trip, estimate: forecast?.estimate };
  }, [trip, forecast]);
  if (!schedules)
    return (
      <article className="route-card" data-timetable-unavailable="true">
        <header>
          <RailMark color={route.color} symbol={lineSymbol(route.line)} />
          <h3>
            {lineName(route.line)} {route.direction}方面
          </h3>
        </header>
        <TimetableUnavailable now={now} />
      </article>
    );
  const Board = mode === 'toei' ? ToeiDepartureBoard : RouteCard;
  const estimated = serverDisplay
    ? serverDisplay.estimatedDiagram
    : 'estimatedDiagram' in localDisplay
      ? localDisplay.estimatedDiagram
      : forecast?.position;
  const diagram: DepartureBoardDisplay = collectedMode
    ? {
        ...display,
        position: props.operation && props.operation.state !== 'normal' ? undefined : estimated,
      }
    : display;
  const board = diagram.board;
  const presentedBoard = serverDisplay
    ? board
    : board.kind === 'active' && board.departures.some((departure) => departure.gtfs)
      ? {
          ...board,
          departures: board.departures.map((departure) =>
            withTrainType(
              scoped,
              departure,
              departure.gtfs
                ? matchedTrainPosition(scoped, departure, positions, now)?.trainType
                : undefined,
            ),
          ),
        }
      : board.kind === 'ended' && board.nextDeparture.gtfs
        ? { ...board, nextDeparture: withTrainType(scoped, board.nextDeparture) }
        : board;
  const at =
    !serverDisplay && props.operation?.state === 'normal'
      ? statisticalArrivalTime(scoped, first, positions, now)
      : undefined;
  const arrivalEstimate =
    props.operation?.state === 'normal' && serverDisplay
      ? serverDisplay.arrivalEstimate
      : at === undefined
        ? undefined
        : new Date(at).toLocaleTimeString('ja-JP', {
            timeZone: 'Asia/Tokyo',
            hour: '2-digit',
            minute: '2-digit',
          });
  const source = serverDisplay ? 'server' : 'local';
  return (
    <div style={{ display: 'contents' }} data-departure-board-state={source}>
      <Board
        {...props}
        route={scoped}
        now={now}
        display={{ ...diagram, board: presentedBoard, arrivalEstimate }}
        source={source}
      />
    </div>
  );
}
