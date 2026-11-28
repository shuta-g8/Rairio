import type { Departure, Route } from '../types';
import { lineSymbol } from '../lib/stations';
import { toeiDisplayLanguage } from '../lib/toei-language';
import { trainCarCount } from '../lib/train-car-count';
import { ToeiDestination } from './ToeiDestination';
import { DepartureRow } from './DepartureBoard';
import { ToeiDepartureRank } from './ToeiDepartureRank';
import { ToeiTrainType } from './ToeiTrainType';
import { useToeiDepartureFlip } from '../hooks/useToeiDepartureFlip';
import { useToeiTextFit } from '../hooks/useToeiTextFit';

const SPECIAL_DEPARTURE_LABELS = {
  pass: { en: 'Pass', zh: '通过', ko: '통과' },
  terminates: { en: 'Not in Service', zh: '本站终点站', ko: '당역종점' },
};

interface RowProps {
  departure: Departure;
  route: Route;
  now: Date;
  index: number;
  showRank?: boolean;
}

export function FlippingToeiDepartureRow(props: RowProps) {
  const { departure, phase } = useToeiDepartureFlip(props.departure);
  return <ToeiDepartureRow {...props} departure={departure} phase={phase} />;
}

export function ToeiSpecialDepartureRow({
  kind,
  index,
  phase,
}: {
  kind: keyof typeof SPECIAL_DEPARTURE_LABELS;
  index: number;
  phase?: ReturnType<typeof useToeiDepartureFlip>['phase'];
}) {
  const ref = useToeiTextFit();
  const labels = SPECIAL_DEPARTURE_LABELS[kind];
  return (
    <div
      className={`departure-row ${index === 0 ? 'first' : 'second'}`}
      data-special-kind={kind}
      data-flip={phase}
    >
      <div ref={ref} className="departure-destination toei-destination toei-special-destination">
        <div className="toei-destination-heading" lang="ja">
          <span className="destination-name">
            <span className="toei-fit-text">
              {kind === 'pass' ? (
                <>
                  <span>通</span>
                  <span>過</span>
                </>
              ) : (
                '当駅止まり'
              )}
            </span>
          </span>
        </div>
        <div className="toei-destination-side">
          <div className="toei-destination-translations">
            <span>
              <span lang="en">{labels.en}</span>
              <span className="toei-special-secondary-languages">
                <span lang="zh-Hans">{labels.zh}</span>
                <span lang="ko">{labels.ko}</span>
              </span>
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

export function ToeiDepartureRow({
  departure,
  route,
  now,
  index,
  showRank = true,
  phase,
}: RowProps & { phase?: ReturnType<typeof useToeiDepartureFlip>['phase'] }) {
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
      destinationContent={<ToeiDestination route={route} train={departure} language={language} />}
    />
  );
}
