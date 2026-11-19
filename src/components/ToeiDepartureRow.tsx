import type { Departure, Route } from '../types';
import { lineSymbol } from '../lib/stations';
import { toeiDisplayLanguage } from '../lib/toei-language';
import { trainCarCount } from '../lib/train-car-count';
import { ToeiDestination } from './ToeiDestination';
import { DepartureRow } from './DepartureBoard';
import { ToeiDepartureRank } from './ToeiDepartureRank';
import { ToeiTrainType } from './ToeiTrainType';
import { useToeiDepartureFlip } from '../hooks/useToeiDepartureFlip';

export function ToeiDepartureRow({
  departure: incoming,
  route,
  now,
  index,
  showRank = true,
}: {
  departure: Departure;
  route: Route;
  now: Date;
  index: number;
  showRank?: boolean;
}) {
  const { departure, phase } = useToeiDepartureFlip(incoming);
  const symbol = lineSymbol(route.line);
  const language = toeiDisplayLanguage(now);
  const carCount = trainCarCount(route, departure);
  return (
    <DepartureRow
      departure={departure}
      route={route}
      now={now}
      index={index}
      flip={phase}
      showStatus={false}
      showNextDay={false}
      showRank={showRank}
      showType={symbol !== 'E'}
      rankContent={<ToeiDepartureRank index={index} now={now} />}
      typeContent={
        <ToeiTrainType
          type={departure.type}
          now={now}
          railwayId={route.railwayId}
          secondary={index > 0}
        />
      }
      trailingContent={
        <div className="toei-car-count" aria-label={carCount ? `${carCount}両編成` : undefined}>
          {carCount && (
            <>
              <strong>{carCount}</strong>
              <span className="toei-car-unit">
                <span>両</span>
                <small lang={language} aria-hidden="true">
                  {{ ja: 'りょう', en: 'cars', 'zh-Hans': '辆', ko: '량' }[language]}
                </small>
              </span>
            </>
          )}
        </div>
      }
      destinationContent={
        <ToeiDestination
          route={route}
          destination={departure.destination}
          extra={departure.extra}
          language={language}
        />
      }
    />
  );
}
