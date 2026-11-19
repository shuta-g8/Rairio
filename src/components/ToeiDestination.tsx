import { memo } from 'react';
import type { Route } from '../types';
import { toeiBoardDestination } from '../lib/toei-board';
import type { ToeiDisplayLanguage } from '../lib/toei-language';
import {
  toeiDestinationNameLines,
  toeiDestinationTranslation,
  type ToeiDestinationTranslation,
} from '../lib/toei-destination-text';
import { useToeiTextFit } from '../hooks/useToeiTextFit';

export const ToeiDestination = memo(function ToeiDestination({
  route,
  destination,
  extra,
  language,
}: {
  route: Route;
  destination: string;
  extra?: boolean;
  language: ToeiDisplayLanguage;
}) {
  const details = toeiBoardDestination(route, destination);
  const { stations, via, terminal } = details;
  const translation = toeiDestinationTranslation(details, language);
  const destinationRef = useToeiTextFit(
    stations.map(({ name }) => name).join('・'),
    translation?.language || language,
  );
  return (
    <div ref={destinationRef} className="departure-destination toei-destination">
      <div
        className="toei-destination-heading"
        lang="ja"
        data-terminal={terminal || undefined}
        aria-label={
          terminal
            ? `${stations[0].name}行`
            : via
              ? `${stations[0].name}経由${stations[1].name}行`
              : `${route.direction}方面行`
        }
      >
        {stations.map(({ name, code }, stationIndex) => (
          <span className="toei-direction-station" key={name}>
            {code && (
              <span className="toei-station-number" role="img" aria-label={`駅番号 ${code}`}>
                <span aria-hidden="true">
                  {code.split('-')[0]}
                  <b>{code.split('-')[1]}</b>
                </span>
              </span>
            )}
            <ToeiDestinationName name={name} />
            {via && stationIndex === 0 && <span className="toei-destination-via">経由</span>}
          </span>
        ))}
        <span className="toei-destination-via">{via || terminal ? '行' : '方面行'}</span>
      </div>
      <ToeiDestinationTranslations translation={translation} />
      {extra && (
        <div className="platform">
          <span className="conditional">運転日注意</span>
        </div>
      )}
    </div>
  );
});

function ToeiDestinationName({ name }: { name: string }) {
  const lines = toeiDestinationNameLines(name);
  return (
    <span
      className="destination-name"
      data-lines={lines.length > 1 ? String(lines.length) : undefined}
    >
      <span className="toei-fit-text">
        {lines.length === 1 ? lines[0] : lines.map((line) => <span key={line}>{line}</span>)}
      </span>
    </span>
  );
}

function ToeiDestinationTranslations({
  translation,
}: {
  translation?: ToeiDestinationTranslation;
}) {
  if (!translation) return null;
  const { language, lines } = translation;
  return (
    <div className="toei-destination-translations">
      <span lang={language}>
        {language !== 'ja' && lines.length === 1
          ? lines[0].text
          : lines.map((line, index) => (
              <span key={index}>
                {line.text}
                {line.suffix && <small>{line.suffix}</small>}
              </span>
            ))}
      </span>
    </div>
  );
}
