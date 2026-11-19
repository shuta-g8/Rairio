import type { CSSProperties } from 'react';
import { ArrowRightIcon } from '@phosphor-icons/react/dist/csr/ArrowRight';
import type { Route } from '../types';
import type { LineOperation } from '../../shared/railways';
import { DESTINATIONS_EN } from '../lib/destinations';
import { lineName, lineSymbol } from '../lib/stations';
import { ToeiDepartureRow } from './ToeiDepartureRow';
import { ToeiArrivalNotice } from './ToeiArrivalNotice';
import { RailMark } from './RailMark';
import { OperationBadge } from './operations/OperationBadge';
import { ToeiBoardCenter } from './ToeiBoardCenter';
import type { DepartureBoardDisplay } from '../lib/live-departures';
import { TOEI_FLIP_HALF_MS } from '../hooks/useToeiDepartureFlip';

export function ToeiDepartureBoard({
  route,
  now,
  onOpen,
  operation,
  previous,
  display,
}: {
  route: Route;
  now: Date;
  onOpen: () => void;
  operation?: LineOperation;
  previous: boolean;
  display: DepartureBoardDisplay;
}) {
  const { board, presentation, position, livePhase } = display;
  const first = board.kind === 'active' ? board.departures[0] : undefined;
  const attention =
    presentation?.kind === 'approaching' ||
    (!livePhase && (presentation?.kind === 'departing' || presentation?.kind === 'progress'));
  const englishDirection = route.direction
    .split('・')
    .map((name) => DESTINATIONS_EN[name])
    .filter(Boolean)
    .join(', ');

  return (
    <article
      className="route-card toei-board"
      data-railway={route.railwayId || (lineSymbol(route.line) === 'E' ? 'Oedo' : undefined)}
      style={
        {
          '--line-color': route.color,
          '--toei-flip-half-duration': `${TOEI_FLIP_HALF_MS}ms`,
        } as CSSProperties
      }
    >
      <div className="toei-board-housing">
        <div className="toei-board-layout">
          <header className="toei-board-heading">
            <RailMark color={route.color} symbol={lineSymbol(route.line)} />
            <div className="toei-board-direction">
              <p>{lineName(route.line)}</p>
              <h3>
                {route.direction}
                <span>方面</span>
              </h3>
              {englishDirection && <small lang="en">For {englishDirection}</small>}
            </div>
            <OperationBadge operation={operation} previous={previous} />
          </header>
          <div className="toei-board-face">
            <div className="toei-board-trains">
              {board.kind === 'active' && (
                <>
                  <ToeiDepartureRow
                    departure={board.departures[0]}
                    index={0}
                    now={now}
                    route={route}
                  />
                  {attention ? (
                    <ToeiArrivalNotice />
                  ) : (
                    <ToeiBoardCenter
                      route={route}
                      train={first}
                      nextDepartures={board.departures.slice(1)}
                      now={now}
                      operation={operation}
                      previous={previous}
                      position={position}
                    />
                  )}
                </>
              )}
              {board.kind === 'ended' && (
                <>
                  <div className="toei-board-ended" role="status">
                    本日の運転は終了しました。
                  </div>
                  <div className="toei-board-ended-middle" aria-hidden="true" />
                  <ToeiDepartureRow
                    departure={board.nextDeparture}
                    index={1}
                    now={now}
                    route={route}
                  />
                </>
              )}
              {board.kind === 'empty' && (
                <p className="toei-board-ended">発車予定がありません。時刻表をご確認ください。</p>
              )}
            </div>
          </div>
        </div>
      </div>
      <button className="full-timetable" onClick={onOpen}>
        一日分の時刻表
        <span>
          <ArrowRightIcon size={14} aria-hidden="true" />
        </span>
      </button>
    </article>
  );
}
