import { useLayoutEffect, useRef, type CSSProperties } from 'react';
import { ArrowRightIcon } from '@phosphor-icons/react/dist/csr/ArrowRight';
import type { Route } from '../types';
import type { LineOperation } from '../../shared/railways';
import { lineName, lineSymbol } from '../lib/stations';
import { toeiBoardDestination } from '../lib/toei-board';
import { toeiDestinationTranslation } from '../lib/toei-destination-text';
import {
  FlippingToeiDepartureRow,
  ToeiDepartureRow,
  ToeiSpecialDepartureRow,
} from './ToeiDepartureRow';
import { RailMark } from './RailMark';
import { OperationBadge, StatusBadge } from './operations/OperationBadge';
import { ToeiBoardCenter } from './ToeiBoardCenter';
import type { DepartureBoardDisplay } from '../lib/live-departures';
import {
  TOEI_FLIP_HALF_MS,
  toeiBoardRowIdentity,
  toeiBoardRowTime,
  useToeiDepartureFlip,
  type ToeiBoardRow,
} from '../hooks/useToeiDepartureFlip';
import { useToeiFirstPosition } from '../hooks/useToeiFirstPosition';
import { useToeiRowRestore } from '../hooks/useToeiRowRestore';
import { useToeiSpecialCalls } from '../hooks/useToeiSpecialCalls';
import {
  useDepartureDisplayDiagnostics,
  type DepartureDisplaySource,
} from '../hooks/useDepartureDisplayDiagnostics';
import { departureIdentity } from '../lib/time';
import type { TrainPositionsSnapshot } from '../../shared/train-positions';

const POSSIBLE_DELAY_NOTICE_MS = 3 * 60_000;

export function ToeiDepartureBoard({
  route,
  now,
  onOpen,
  operation,
  previous,
  display,
  source,
  specialPositions,
}: {
  route: Route;
  now: Date;
  onOpen: () => void;
  operation?: LineOperation;
  previous: boolean;
  display: DepartureBoardDisplay;
  source: DepartureDisplaySource;
  specialPositions?: TrainPositionsSnapshot | null;
}) {
  const { board, presentation, position, livePhase } = display;
  const departures = board.kind === 'active' ? board.departures : [];
  const scheduledFirst = departures[0];
  const specials = useToeiSpecialCalls(route, specialPositions, now);
  const ordinaryPosition = useToeiFirstPosition(route, scheduledFirst, specialPositions, now);
  const rows: ToeiBoardRow[] = [...departures];
  // Keep a stopping train already entering or at the platform in the first row.
  const locked = ordinaryPosition.occupyingFirst ? 1 : 0;
  for (const call of specials) {
    const index = rows.findIndex(
      (row, index) => index >= locked && toeiBoardRowTime(row) > call.at,
    );
    rows.splice(index === -1 ? rows.length : index, 0, call);
  }
  const [first, next] = rows;
  const rowRestore = useToeiRowRestore(route, now, first, next);
  const firstFlip = useToeiDepartureFlip(first, { settleImmediately: rowRestore.first });
  const firstIsSpecial = !!first && 'kind' in first;
  const nextFlip = useToeiDepartureFlip(next, {
    firstFlipStart: firstFlip.pending ? 'pending' : firstFlip.startedAt,
    animateEarlierChange: firstIsSpecial,
    settleImmediately: rowRestore.next,
  });
  const shownFirst = firstFlip.departure;
  const shownNext = nextFlip.departure;
  const shownTrain = shownFirst && !('kind' in shownFirst) ? shownFirst : undefined;
  const hasSpecialRow = [first, next, shownFirst, shownNext].some((row) => row && 'kind' in row);
  const settlingSpecialRows = useRef(false);
  // A changed or expired special call can move another train between the rows.
  const duplicateDuringSpecialChange =
    (hasSpecialRow || settlingSpecialRows.current) &&
    !!shownFirst &&
    !!shownNext &&
    toeiBoardRowIdentity(shownFirst) === toeiBoardRowIdentity(shownNext);
  useLayoutEffect(() => {
    settlingSpecialRows.current = hasSpecialRow || duplicateDuringSpecialChange;
  }, [hasSpecialRow, duplicateDuringSpecialChange]);
  useLayoutEffect(() => {
    rowRestore.recordShownRows(
      shownFirst,
      shownFirst && !duplicateDuringSpecialChange ? shownNext : undefined,
    );
  });
  const possibleDelay =
    !!shownTrain && now.getTime() - shownTrain.timestamp >= POSSIBLE_DELAY_NOTICE_MS;
  const ordinaryKey =
    scheduledFirst && `${route.sourceStationId}/${departureIdentity(scheduledFirst)}`;
  const approachLayout = useRef<{ key?: string; needsPosition: boolean; compact: boolean }>({
    needsPosition: false,
    compact: false,
  });
  const previousApproach =
    approachLayout.current.key === ordinaryKey ? approachLayout.current : undefined;
  // Once the trains can be confused, the timetable alone cannot restart this notice.
  const competingCall = firstIsSpecial || specials.some((call) => !call.beforeApproach);
  const needsPosition = competingCall || !!previousApproach?.needsPosition;
  const showsCurrentFirst =
    scheduledFirst &&
    first === scheduledFirst &&
    shownTrain &&
    departureIdentity(scheduledFirst) === departureIdentity(shownTrain);
  const approachRequested =
    presentation?.kind === 'approaching' ||
    (!livePhase && (presentation?.kind === 'departing' || presentation?.kind === 'progress'));
  const attention =
    !!showsCurrentFirst && approachRequested && (!needsPosition || ordinaryPosition.approaching);
  const compact = attention && (hasSpecialRow || !!previousApproach?.compact);
  const retainPositionRequirement =
    !!ordinaryKey && (!!previousApproach?.needsPosition || (competingCall && approachRequested));
  useLayoutEffect(() => {
    approachLayout.current = {
      key: ordinaryKey,
      needsPosition: retainPositionRequirement,
      compact: compact || (!!previousApproach?.compact && ordinaryPosition.approaching),
    };
  }, [
    ordinaryKey,
    retainPositionRequirement,
    compact,
    previousApproach?.compact,
    ordinaryPosition.approaching,
  ]);
  useDepartureDisplayDiagnostics(
    source,
    route,
    shownTrain,
    shownTrain ? (attention ? 'approaching' : 'normal') : undefined,
  );
  const direction = toeiDestinationTranslation(toeiBoardDestination(route), 'en');
  function renderRow({ departure, phase }: typeof firstFlip, index: number) {
    if (!departure) return;
    return 'kind' in departure ? (
      <ToeiSpecialDepartureRow kind={departure.kind} phase={phase} index={index} />
    ) : (
      <ToeiDepartureRow departure={departure} phase={phase} index={index} now={now} route={route} />
    );
  }

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
              {direction && (
                <small lang={direction.language}>
                  {direction.lines.map(({ text }) => text).join('・')}
                </small>
              )}
            </div>
            <OperationBadge operation={operation} previous={previous} />
            {possibleDelay && <StatusBadge state="delayed">遅延の可能性</StatusBadge>}
          </header>
          <div className="toei-board-face">
            <div className="toei-board-trains">
              {shownFirst && (
                <>
                  {renderRow(firstFlip, 0)}
                  <ToeiBoardCenter
                    route={route}
                    train={shownTrain}
                    nextRow={duplicateDuringSpecialChange ? undefined : renderRow(nextFlip, 1)}
                    now={now}
                    operation={operation}
                    previous={previous}
                    position={showsCurrentFirst ? position : undefined}
                    attention={attention}
                    possibleDelay={possibleDelay}
                    keepRowsVisible={hasSpecialRow || compact}
                  />
                </>
              )}
              {!shownFirst && board.kind === 'ended' && (
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
              {!shownFirst && board.kind === 'empty' && (
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
