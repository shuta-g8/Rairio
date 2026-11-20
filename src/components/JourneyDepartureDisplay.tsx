import type { CSSProperties } from 'react';
import { JOURNEY_LINES, type JourneyLine } from '../../shared/journey';
import type { TrainPositionsSnapshot } from '../../shared/train-positions';
import type { JourneyLcdDeparture } from '../lib/journey-lcd';
import { observedToeiTrainGuidance } from '../lib/toei-position';
import { useClock } from '../hooks/useClock';
import { ToeiDepartureRow } from './ToeiDepartureRow';
import { ToeiArrivalNotice } from './ToeiArrivalNotice';

interface JourneyDepartureSchedule {
  line: JourneyLine;
  stationName: string;
  timestamp: number;
  destination?: string;
  source: 'ODPT' | 'Transitous';
}

const clock = new Intl.DateTimeFormat('ja-JP', {
  timeZone: 'Asia/Tokyo',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

export function JourneyDepartureDisplay({
  lcd,
  schedule,
  positions,
}: (
  | { lcd: JourneyLcdDeparture; schedule?: never }
  | { lcd?: never; schedule: JourneyDepartureSchedule }
) & {
  positions?: TrainPositionsSnapshot | null;
}) {
  const now = useClock(Boolean(lcd));
  const progress =
    lcd && observedToeiTrainGuidance(lcd.route, lcd.departure, positions, now).progress;
  const approaching = progress === 'approaching';
  const departed = lcd && now.getTime() >= lcd.departure.timestamp && progress === 'departed';
  const stationName = lcd?.stationName ?? schedule?.stationName;
  return (
    <div
      className="route-card toei-board journey-departure-display"
      data-railway={lcd?.route.railwayId ?? schedule?.line}
      data-approaching={approaching || undefined}
      data-departed={departed || undefined}
      style={
        {
          '--line-color': lcd ? lcd.route.color : JOURNEY_LINES[schedule.line].color,
        } as CSSProperties
      }
      role="group"
      aria-label={`${stationName}駅 この経路で乗車する列車の都営LCD表示`}
    >
      <div className="journey-lcd-face">
        {departed ? (
          <div className="journey-lcd-departed" role="status">
            この電車はすでにこの駅を発車しています。
          </div>
        ) : approaching ? (
          <ToeiArrivalNotice />
        ) : lcd ? (
          <ToeiDepartureRow
            departure={lcd.departure}
            route={lcd.route}
            now={now}
            index={0}
            showRank={false}
          />
        ) : (
          <div className="journey-scheduled-departure">
            <span>
              <strong>{schedule.destination ? `${schedule.destination}行` : '発車予定'}</strong>
              <small>予定 · {schedule.source}</small>
            </span>
            <time dateTime={new Date(schedule.timestamp).toISOString()}>
              {clock.format(schedule.timestamp)}
            </time>
          </div>
        )}
      </div>
    </div>
  );
}
