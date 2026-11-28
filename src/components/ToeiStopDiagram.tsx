import { memo, useMemo } from 'react';
import type { CSSProperties } from 'react';
import type { ToeiMeguroLocalSection, ToeiStop } from '../lib/toei-stops';
import {
  toeiDiagramStops,
  toeiEnglishStopWeight,
  type ToeiDiagramDirection,
} from '../lib/toei-diagram';
import { TOEI_TRANSFER_NAMES_EN, type ToeiContinuation } from '../lib/toei-map-labels';
import { useToeiDiagramFit } from '../hooks/useToeiDiagramFit';
import { englishDestination } from '../lib/destinations';

export const ToeiStopDiagram = memo(function ToeiStopDiagram({
  stations,
  railwayId,
  english,
  continuation,
  meguroLocalSection,
  terminalVisible,
  direction,
}: {
  stations: ToeiStop[];
  railwayId: string;
  english: boolean;
  continuation?: ToeiContinuation;
  meguroLocalSection?: ToeiMeguroLocalSection;
  terminalVisible: boolean;
  direction: ToeiDiagramDirection;
}) {
  const stops = useMemo(() => toeiDiagramStops(stations, railwayId), [stations, railwayId]);
  const columns = stops.map(
    (station) => `${english ? toeiEnglishStopWeight(station.transfers.length) : station.weight}fr`,
  );
  if (continuation) columns.push(`var(--toei-continuation-width, ${english ? '18fr' : '3.5fr'})`);
  const ref = useToeiDiagramFit(english, stations, continuation, direction);
  return (
    <div
      ref={ref}
      className="toei-stop-information"
      role="note"
      aria-label="先発列車の停車駅"
      lang={english ? 'en' : 'ja'}
      data-english={english || undefined}
      data-terminal={terminalVisible || !!meguroLocalSection || undefined}
      data-meguro-local={!!meguroLocalSection || undefined}
      data-direction={direction}
      style={continuation && ({ '--continuation-color': continuation.lineColor } as CSSProperties)}
    >
      <ol
        className="toei-stop-diagram"
        style={{ gridTemplateColumns: `var(--toei-fitted-columns, ${columns.join(' ')})` }}
      >
        {stops.map((station, index) => (
          <li
            key={`${station.code}-${index}`}
            data-kind={station.kind}
            data-stop-weight={station.weight}
            data-transfer-count={station.transfers.length}
            data-route-start={station.routeStart}
            data-boundary={(continuation && index === stops.length - 1) || undefined}
          >
            {station.kind === 'current' && (
              <span className="toei-stop-current-background" aria-hidden="true" />
            )}
            {station.kind === 'current' &&
              index < stops.length - 1 &&
              !(terminalVisible && index === stops.length - 2) && (
                <span className="toei-stop-cut" aria-hidden="true" />
              )}
            <div className="toei-stop-label">
              <span className="toei-stop-name">
                <span className="toei-stop-name-text">
                  {english
                    ? station.english
                    : [...station.name].map((character, index) => (
                        <span className="toei-stop-character" key={index}>
                          <span className="toei-stop-glyph">{character}</span>
                        </span>
                      ))}
                </span>
              </span>
            </div>
            {station.kind !== 'pass' && station.transfers.length > 0 && (
              <>
                <span className="toei-stop-branch" aria-hidden="true" />
                <ul className="toei-stop-transfers" aria-label={`${station.name}の乗換路線`}>
                  {station.transfers.map((line) => (
                    <li key={line.id}>
                      <span
                        className="toei-transfer-symbol"
                        data-jr={line.jr || undefined}
                        data-white-rim={line.whiteRim || undefined}
                        data-shape={line.shape}
                        aria-hidden="true"
                        style={{ '--transfer-color': line.color } as CSSProperties}
                      >
                        {line.code}
                      </span>
                      <span className="toei-transfer-name">
                        <span className="toei-transfer-name-text">
                          {english ? line.english : line.japanese}
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              </>
            )}
            {station.kind === 'stop' || station.kind === 'current' ? (
              <ToeiStopCode code={station.code} current={station.kind === 'current'} />
            ) : (
              <span
                className="toei-stop-dash"
                aria-label={station.kind === 'pass' ? '通過' : '現在駅より手前'}
              />
            )}
          </li>
        ))}
        {continuation && (
          <li className="toei-stop-continuation">
            {meguroLocalSection ? (
              <ToeiMeguroSection section={meguroLocalSection} english={english} />
            ) : (
              <div className="toei-continuation-label">
                <strong>
                  <span className="toei-continuation-text">
                    {english ? TOEI_TRANSFER_NAMES_EN[continuation.id] : continuation.name}
                  </span>
                </strong>
                {continuation.details.map((detail) => (
                  <span className="toei-continuation-detail" key={detail.ja}>
                    <span className="toei-continuation-text">
                      {english ? detail.en : detail.ja}
                    </span>
                  </span>
                ))}
              </div>
            )}
          </li>
        )}
      </ol>
    </div>
  );
});

function ToeiStopCode({ code, current }: { code: string; current?: boolean }) {
  const [symbol, number] = code.split('-');
  return (
    <span className="toei-stop-code" aria-label={`駅番号 ${code}${current ? ' 現在駅' : ''}`}>
      <span>{symbol}</span>
      <b>{number}</b>
    </span>
  );
}

function ToeiMeguroSection({
  section,
  english,
}: {
  section: ToeiMeguroLocalSection;
  english: boolean;
}) {
  const { destination, code, intermediateStops } = section;
  // Limit the schematic markers to the nine dots shown on the platform LCD.
  const dots = Math.min(intermediateStops, 9);
  return (
    <div className="toei-meguro-section">
      <strong className="toei-meguro-line">
        <ToeiMeguroName name={english ? 'Tokyu Line' : '東急線'} english={english} />
      </strong>
      <div className="toei-meguro-station toei-meguro-first-stop">
        <ToeiMeguroName name={english ? 'Fudomae' : '不動前'} english={english} />
        <ToeiStopCode code="MG-02" />
      </div>
      <div className="toei-meguro-gap">
        <span className="toei-meguro-local-label">
          <span className="toei-continuation-text">
            {english ? 'Stops at all stations' : 'この間各駅にとまります'}
          </span>
        </span>
        <span className="toei-stop-cut toei-meguro-cut" aria-hidden="true" />
        <span className="toei-meguro-dots" aria-hidden="true">
          {Array.from({ length: dots }, (_, index) => (
            <span key={index} />
          ))}
        </span>
      </div>
      <div className="toei-meguro-station toei-meguro-terminal">
        <ToeiMeguroName
          name={english ? (englishDestination(destination) ?? destination) : destination}
          english={english}
        />
        <ToeiStopCode code={code} />
      </div>
    </div>
  );
}

function ToeiMeguroName({ name, english }: { name: string; english: boolean }) {
  if (english)
    return (
      <span className="toei-stop-label">
        <span className="toei-stop-name">
          <span className="toei-stop-name-text">{name}</span>
        </span>
      </span>
    );
  return (
    <span className="toei-meguro-name">
      {[...name].map((character, index) => (
        <span key={index}>{character}</span>
      ))}
    </span>
  );
}
