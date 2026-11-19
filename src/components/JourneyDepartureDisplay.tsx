import type { CSSProperties } from 'react';
import type { TrainPositionsSnapshot } from '../../shared/train-positions';
import type { JourneyLcdDeparture } from '../lib/journey-lcd';
import { observedToeiTrainGuidance } from '../lib/toei-position';
import { useClock } from '../hooks/useClock';
import { ToeiDepartureRow } from './ToeiDepartureRow';
import { ToeiArrivalNotice } from './ToeiArrivalNotice';

export function JourneyDepartureDisplay({
  lcd,
  positions,
}: {
  lcd: JourneyLcdDeparture;
  positions?: TrainPositionsSnapshot | null;
}) {
  const now = useClock();
  const { progress } = observedToeiTrainGuidance(lcd.route, lcd.departure, positions, now);
  const approaching = progress === 'approaching';
  const departed = progress === 'departed';
  return (
    <div
      className="route-card toei-board journey-departure-display"
      data-railway={lcd.route.railwayId}
      data-approaching={approaching || undefined}
      data-departed={departed || undefined}
      style={{ '--line-color': lcd.route.color } as CSSProperties}
      role="group"
      aria-label={`${lcd.stationName}駅 この経路で乗車する列車の都営LCD表示`}
    >
      <div className="journey-lcd-face">
        {departed ? (
          <div className="journey-lcd-departed" role="status">
            この電車はすでにこの駅を発車しています。
          </div>
        ) : approaching ? (
          <ToeiArrivalNotice />
        ) : (
          <ToeiDepartureRow
            departure={lcd.departure}
            route={lcd.route}
            now={now}
            index={0}
            showRank={false}
          />
        )}
      </div>
    </div>
  );
}
