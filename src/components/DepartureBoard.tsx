import { memo, useEffect, useRef, type CSSProperties, type ReactNode } from 'react';
import { ArrowRightIcon } from '@phosphor-icons/react/dist/csr/ArrowRight';
import { CalendarDotsIcon } from '@phosphor-icons/react/dist/csr/CalendarDots';
import { ClockIcon } from '@phosphor-icons/react/dist/csr/Clock';
import type { Departure, Route } from '../types';
import type { LineOperation } from '../../shared/railways';
import {
  DEPARTURE_PROGRESS_MS,
  departurePresentation,
  isFutureJapanDate,
  remaining,
  type DeparturePresentation,
} from '../lib/time';
import { lineName, lineSymbol } from '../lib/stations';
import { trainTypeColor, trainTypeLabel, trainTypeName } from '../lib/train-type';
import { OperationBadge } from './operations/OperationBadge';

import { RailMark } from './RailMark';
import { Destination } from './Destination';
import type { DepartureBoardDisplay } from '../lib/live-departures';

function Countdown({
  departure,
  now,
  approximate,
}: {
  departure: Departure;
  now: Date;
  approximate: boolean;
}) {
  const { minutes, seconds } = remaining(departure.timestamp, now);
  if (approximate) {
    const roundedMinutes = minutes + Number(seconds > 0);
    return (
      <div className="countdown countdown-approximate" aria-label={`約${roundedMinutes}分後に発車`}>
        <span>約</span>
        <strong>{roundedMinutes}</strong>
        <span>分後</span>
      </div>
    );
  }
  return (
    <div className="countdown" aria-label={`発車まで${minutes}分${seconds}秒`}>
      <span className="countdown-prefix">あと</span>
      <strong>{minutes > 99 ? Math.floor(minutes / 60) : minutes}</strong>
      <span>{minutes > 99 ? '時間' : '分'}</span>
      <strong className="countdown-seconds">
        {String(minutes > 99 ? minutes % 60 : seconds).padStart(2, '0')}
      </strong>
      <span>{minutes > 99 ? '分' : '秒'}</span>
    </div>
  );
}

function DepartureProgress({ elapsedMs, progress }: { elapsedMs: number; progress: number }) {
  const circle = useRef<SVGCircleElement>(null);
  const animation = useRef<Animation | null>(null);
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const active = circle.current!.animate(
      [{ strokeDashoffset: '100' }, { strokeDashoffset: '0' }],
      { duration: DEPARTURE_PROGRESS_MS, easing: 'linear', fill: 'both' },
    );
    animation.current = active;
    return () => {
      active.cancel();
      animation.current = null;
    };
  }, []);
  useEffect(() => {
    // Keep animation aligned with the actual deadline, including tab resume and clock changes.
    if (animation.current) animation.current.currentTime = elapsedMs;
  }, [elapsedMs]);
  return (
    <div
      className="departure-progress"
      role="progressbar"
      aria-label="発車案内の切り替え中"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(progress * 100)}
    >
      <svg viewBox="0 0 40 40" aria-hidden="true">
        <circle className="departure-progress-track" cx="20" cy="20" r="16" />
        <circle
          ref={circle}
          className="departure-progress-fill"
          cx="20"
          cy="20"
          r="16"
          pathLength="100"
          strokeDasharray="100"
          strokeDashoffset={100 - progress * 100}
        />
      </svg>
    </div>
  );
}

function DepartureStatus({
  departure,
  now,
  approximate,
  presentation = departurePresentation(departure.timestamp, now),
}: {
  departure: Departure;
  now: Date;
  approximate: boolean;
  presentation?: DeparturePresentation;
}) {
  if (presentation.kind === 'stopped')
    return (
      <div className="departure-announcement departure-stopped" role="status">
        <span>当駅に</span>
        <br />
        <span>停車中</span>
      </div>
    );
  if (presentation.kind === 'approaching' || presentation.kind === 'departing') {
    const approaching = presentation.kind === 'approaching';
    return (
      <div
        className={approaching ? 'arrival-announcement' : 'departure-announcement'}
        role="status"
        aria-live={approaching ? 'polite' : undefined}
      >
        <span>電車が</span>
        <br />
        <span>{approaching ? '到着します' : '発車します'}</span>
      </div>
    );
  }
  if (presentation.kind === 'progress')
    return (
      <DepartureProgress elapsedMs={presentation.elapsedMs} progress={presentation.progress} />
    );
  if (presentation.kind === 'expired') return null;
  return <Countdown departure={departure} now={now} approximate={approximate} />;
}

export function DepartureRow({
  departure,
  now,
  index,
  route,
  showStatus = true,
  destinationContent,
  rankContent,
  showRank = true,
  typeContent,
  showType = true,
  showNextDay = true,
  trailingContent,
  presentation,
  flip,
}: {
  departure: Departure;
  now: Date;
  index: number;
  route: Route;
  showStatus?: boolean;
  destinationContent?: ReactNode;
  rankContent?: ReactNode;
  showRank?: boolean;
  typeContent?: ReactNode;
  showType?: boolean;
  showNextDay?: boolean;
  trailingContent?: ReactNode;
  presentation?: DeparturePresentation;
  flip?: 'out' | 'in';
}) {
  const isYamanote = route.line.includes('山手線');
  const tomorrow = isFutureJapanDate(departure.timestamp, now);
  const railwayId =
    route.railwayId || ({ A: 'Asakusa', I: 'Mita', S: 'Shinjuku' }[lineSymbol(route.line)] ?? '');
  const typeName = trainTypeName(departure.type, railwayId);
  const typeBackground = trainTypeColor(departure.type, railwayId);
  return (
    <div className={`departure-row ${index === 0 ? 'first' : 'second'}`} data-flip={flip}>
      {(showRank || showType) && (
        <div className="departure-type">
          {showRank && (
            <span className="departure-rank">{rankContent ?? (index === 0 ? '先発' : '次発')}</span>
          )}
          {showType && (
            <span
              className="train-type"
              data-unfilled={typeBackground === 'transparent' || undefined}
              style={{ backgroundColor: typeBackground }}
              title={typeName}
              aria-label={typeName}
            >
              {typeContent ?? trainTypeLabel(departure.type, index > 0, railwayId)}
            </span>
          )}
        </div>
      )}
      {destinationContent ?? (
        <Destination
          destination={departure.destination}
          platform={departure.platform}
          extra={departure.extra}
          yamanoteDirection={isYamanote ? route.direction : undefined}
        />
      )}
      {!isYamanote && (
        <div className="departure-time">
          <time dateTime={new Date(departure.timestamp).toISOString()}>{departure.time}</time>
          {tomorrow && showNextDay && <span className="next-day">翌日</span>}
        </div>
      )}
      {trailingContent}
      {showStatus && (
        <div className="departure-status">
          <DepartureStatus
            departure={departure}
            now={now}
            approximate={isYamanote}
            presentation={presentation}
          />
        </div>
      )}
    </div>
  );
}

export function RouteCard({
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
  const { board, presentation, presentations } = display;
  return (
    <article className="route-card" style={{ '--line-color': route.color } as CSSProperties}>
      <RouteHeading route={route} operation={operation} previous={previous} />
      <div className="departures">
        <div className="departure-columns" aria-hidden="true">
          <span>種別</span>
          <span>行先</span>
          <span>時刻</span>
          <span>発車案内</span>
        </div>
        {board.kind === 'ended' && (
          <>
            <div className="departure-row first service-ended-row">
              <div className="departure-type">
                <span className="departure-rank">先発</span>
              </div>
              <p className="service-ended" role="status">
                <ClockIcon size={18} aria-hidden="true" />
                本日の運転は終了しました。
              </p>
            </div>
            <DepartureRow departure={board.nextDeparture} index={1} now={now} route={route} />
          </>
        )}
        {board.kind === 'active' &&
          board.departures.map((departure, index) => (
            <DepartureRow
              key={`${departure.timestamp}-${departure.destination}-${index}`}
              departure={departure}
              index={index}
              now={now}
              route={route}
              presentation={presentations?.[index] ?? (index === 0 ? presentation : undefined)}
            />
          ))}
        {board.kind === 'empty' && (
          <p className="empty-message">発車予定がありません。時刻表をご確認ください。</p>
        )}
      </div>
      <button className="full-timetable" onClick={onOpen}>
        <CalendarDotsIcon size={15} aria-hidden="true" />
        一日分の時刻表
        <span>
          <ArrowRightIcon size={16} aria-hidden="true" />
        </span>
      </button>
    </article>
  );
}

const RouteHeading = memo(function RouteHeading({
  route,
  operation,
  previous,
}: {
  route: Route;
  operation?: LineOperation;
  previous: boolean;
}) {
  return (
    <div className="route-card-heading">
      <RailMark color={route.color} symbol={lineSymbol(route.line)} />
      <div>
        <p className="line-title">{lineName(route.line)}</p>
        <h3>
          {route.direction}
          <span>方面</span>
        </h3>
        <OperationBadge operation={operation} previous={previous} />
      </div>
    </div>
  );
});
