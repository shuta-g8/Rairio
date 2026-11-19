import type { Route } from '../types';
import type { BoardMode } from '../lib/board-mode';
import type { LineOperation } from '../../shared/railways';
import type { TrainPositionsSnapshot } from '../../shared/train-positions';
import { useLiveDepartures } from '../hooks/useLiveDepartures';
import { RouteCard } from './DepartureBoard';
import { ToeiDepartureBoard } from './ToeiDepartureBoard';
import { schedulesForDate, editionServiceDate } from '../../shared/timetable-editions';
import { TimetableUnavailable } from './TimetableUnavailable';
import { RailMark } from './RailMark';
import { lineName, lineSymbol } from '../lib/stations';
import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { collectedDiagramEstimate } from '../lib/toei-position';
import type { PositionEstimate } from '../../shared/position-estimate';

/** Keep the live deadline across display-mode changes without retaining hidden boards. */
export function StationDepartureBoard({
  mode,
  route,
  now,
  positions,
  ...props
}: {
  mode: BoardMode;
  route: Route;
  now: Date;
  positions?: TrainPositionsSnapshot | null;
  onOpen: () => void;
  operation?: LineOperation;
  previous: boolean;
}) {
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
  const display = useLiveDepartures(scoped, positions, now, !legacyDiagram);
  const first = display.board.kind === 'active' ? display.board.departures[0] : undefined;
  const collectedMode =
    mode === 'toei' && !legacyDiagram && (!positions || positions.collected !== undefined);
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
  const estimated = 'estimatedDiagram' in display ? display.estimatedDiagram : forecast?.position;
  const diagram = collectedMode
    ? {
        ...display,
        position: props.operation && props.operation.state !== 'normal' ? undefined : estimated,
      }
    : display;
  return <Board {...props} route={scoped} now={now} display={diagram} />;
}
