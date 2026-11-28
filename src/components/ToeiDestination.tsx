import { memo } from 'react';
import type { Departure, Route } from '../types';
import { toeiBoardDestination } from '../lib/toei-board';
import type { ToeiDisplayLanguage } from '../lib/toei-language';
import {
  toeiDestinationTranslation,
  type ToeiDestinationTranslation,
} from '../lib/toei-destination-text';
import { useToeiTextFit } from '../hooks/useToeiTextFit';

export const ToeiDestination = memo(function ToeiDestination({
  route,
  train,
  language,
}: {
  route: Route;
  train: Departure;
  language: ToeiDisplayLanguage;
}) {
  const details = toeiBoardDestination(route, train.destination, train);
  const { stations, via, terminal } = details;
  const translation = toeiDestinationTranslation(details, language);
  const destinationRef = useToeiTextFit();
  const lineVia = terminal && via;
  return (
    <div
      ref={destinationRef}
      className="departure-destination toei-destination"
      data-line-via={lineVia || undefined}
    >
      <div
        className="toei-destination-heading"
        lang="ja"
        data-terminal={terminal || undefined}
        aria-label={
          via
            ? `${stations[0].name}経由${stations[1].name}行`
            : terminal
              ? `${stations[0].name}行`
              : `${route.direction}方面行`
        }
      >
        {stations.map(({ name, code }, stationIndex) => (
          <span className="toei-direction-station" key={name}>
            {code && <ToeiDestinationNumber code={code} />}
            <ToeiDestinationName name={name} />
            {via && stationIndex === 0 && <ToeiDestinationSuffix text="経由" />}
            {lineVia && stationIndex === 1 && <ToeiDestinationSuffix text="行" />}
          </span>
        ))}
        {!lineVia && <ToeiDestinationSuffix text={via || terminal ? '行' : '方面行'} />}
      </div>
      {(translation || train.extra) && (
        <div className="toei-destination-side">
          <ToeiDestinationTranslations translation={translation} />
          {train.extra && (
            <div className="platform">
              <span className="conditional">運転日注意</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
});

function ToeiDestinationNumber({ code }: { code: string }) {
  const [symbol, number] = code.split('-');
  return (
    <span
      className="toei-station-number"
      data-symbol={symbol.length > 1 ? symbol : undefined}
      role="img"
      aria-label={`駅番号 ${code}`}
    >
      <span aria-hidden="true">
        {symbol}
        <b>{number}</b>
      </span>
    </span>
  );
}

function ToeiDestinationName({ name }: { name: string }) {
  const kanjiCount = /^\p{Script=Han}{2,4}$/u.test(name) ? [...name].length : undefined;
  return (
    <span className="destination-name" data-kanji-count={kanjiCount}>
      <span className="toei-fit-text">{name}</span>
    </span>
  );
}

function ToeiDestinationSuffix({ text }: { text: string }) {
  return (
    <span className="toei-destination-via">
      <span className="toei-fit-text">{text}</span>
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
