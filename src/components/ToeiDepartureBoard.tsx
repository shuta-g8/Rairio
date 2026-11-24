import type { CSSProperties } from 'react';
import { ArrowRightIcon } from '@phosphor-icons/react/dist/csr/ArrowRight';
import type { Route } from '../types';
import type { LineOperation } from '../../shared/railways';
import { DESTINATIONS_EN } from '../lib/destinations';
import { lineName, lineSymbol } from '../lib/stations';
import { FlippingToeiDepartureRow, ToeiDepartureRow } from './ToeiDepartureRow';
import { ToeiArrivalNotice } from './ToeiArrivalNotice';
import { RailMark } from './RailMark';
import { OperationBadge, StatusBadge } from './operations/OperationBadge';
import { ToeiBoardCenter } from './ToeiBoardCenter';
import { ToeiPossibleDelayNotice } from './ToeiBoardInformation';
import type { DepartureBoardDisplay } from '../lib/live-departures';
import { TOEI_FLIP_HALF_MS, useToeiDepartureFlip } from '../hooks/useToeiDepartureFlip';
import { departureIdentity } from '../lib/time';

const POSSIBLE_DELAY_NOTICE_MS = 3 * 60_000;

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
  const { departure: shownFirst, phase } = useToeiDepartureFlip(first);
  const possibleDelay =
    !!shownFirst && now.getTime() - shownFirst.timestamp >= POSSIBLE_DELAY_NOTICE_MS;
  const showsCurrentFirst =
    first && shownFirst && departureIdentity(first) === departureIdentity(shownFirst);
  const attention =
    showsCurrentFirst &&
    (presentation?.kind === 'approaching' ||
      (!livePhase && (presentation?.kind === 'departing' || presentation?.kind === 'progress')));
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
            {possibleDelay && <StatusBadge state="delayed">遅延の可能性</StatusBadge>}
          </header>
          <div className="toei-board-face">
            <div className="toei-board-trains">
              {board.kind === 'active' && shownFirst && (
                <>
                  <ToeiDepartureRow
                    departure={shownFirst}
                    phase={phase}
                    index={0}
                    now={now}
                    route={route}
                  />
                  {attention ? (
                    <>
                      {possibleDelay && <ToeiPossibleDelayNotice />}
                      <ToeiArrivalNotice />
                    </>
                  ) : (
                    <ToeiBoardCenter
                      route={route}
                      train={shownFirst}
                      nextDepartures={board.departures.slice(1)}
                      now={now}
                      operation={operation}
                      previous={previous}
                      position={showsCurrentFirst ? position : undefined}
                      possibleDelay={possibleDelay}
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
                  <FlippingToeiDepartureRow
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
      {showsCurrentFirst && display.arrivalEstimate && (
        <p className="journey-data-note">
          先発列車の駅付近への到着予測　{display.arrivalEstimate}頃
        </p>
      )}
      <button className="full-timetable" onClick={onOpen}>
        一日分の時刻表
        <span>
          <ArrowRightIcon size={14} aria-hidden="true" />
        </span>
      </button>
    </article>
  );
}
