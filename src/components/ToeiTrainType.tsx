import { toeiDisplayLanguage } from '../lib/toei-language';
import { toeiTrainTypeDisplay } from '../lib/toei-train-type';
import { useToeiTrainTypeFit } from '../hooks/useToeiTrainTypeFit';
import { AirportFlightIcon } from './AirportFlightIcon';

export function ToeiTrainType({
  type,
  now,
  railwayId,
  secondary = false,
}: {
  type: string;
  now: Date;
  railwayId?: string;
  secondary?: boolean;
}) {
  const language = toeiDisplayLanguage(now);
  const display = toeiTrainTypeDisplay(type, railwayId, language, secondary);
  const ref = useToeiTrainTypeFit(type, language, railwayId, secondary);
  return (
    <span
      ref={ref}
      className="toei-train-type-content"
      data-layout={secondary ? 'side' : 'stacked'}
    >
      <span className="toei-type-heading" lang="ja">
        {display.airplane && <AirportFlightIcon />}
        <span className="toei-type-name">
          <span className="toei-fit-text">
            {display.prefix && <span className="toei-type-prefix">{display.prefix}</span>}
            {display.name}
          </span>
        </span>
      </span>
      {display.translation.length > 0 && (
        <span className="toei-type-translation-box">
          <small className="toei-type-translation" lang={language} aria-hidden="true">
            {display.translation.map((line, index) => (
              <span className="toei-fit-text" key={index}>
                {line}
              </span>
            ))}
          </small>
        </span>
      )}
    </span>
  );
}
