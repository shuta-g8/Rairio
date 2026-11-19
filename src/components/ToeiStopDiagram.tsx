import { memo, useMemo } from 'react';
import type { CSSProperties } from 'react';
import type { ToeiStop } from '../lib/toei-stops';
import {
  toeiDiagramStops,
  toeiEnglishStopWeight,
  type ToeiDiagramDirection,
} from '../lib/toei-diagram';
import {
  TOEI_TRANSFER_NAMES_EN,
  toeiMapColor,
  type ToeiContinuation,
} from '../lib/toei-map-labels';
import { useToeiDiagramFit } from '../hooks/useToeiDiagramFit';

export const ToeiStopDiagram = memo(function ToeiStopDiagram({
  stations,
  railwayId,
  through,
  english,
  continuation,
  terminalVisible,
  direction,
}: {
  stations: ToeiStop[];
  railwayId: string;
  through: boolean;
  english: boolean;
  continuation?: ToeiContinuation;
  terminalVisible: boolean;
  direction: ToeiDiagramDirection;
}) {
  const stops = useMemo(() => toeiDiagramStops(stations, railwayId), [stations, railwayId]);
  const columns = stops.map(
    (station) => `${english ? toeiEnglishStopWeight(station.transfers.length) : station.weight}fr`,
  );
  if (continuation) columns.push(english ? '18fr' : '3.5fr');
  const ref = useToeiDiagramFit(english, stations, continuation, direction);
  return (
    <div
      ref={ref}
      className="toei-stop-information"
      role="note"
      aria-label="先発列車の停車駅"
      lang={english ? 'en' : 'ja'}
      data-english={english || undefined}
      data-terminal={terminalVisible || undefined}
      data-direction={direction}
    >
      {through && (
        <span className="toei-stop-scope">
          {english ? 'Stops within Toei Subway' : '都営線内の停車駅'}
        </span>
      )}
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
            data-boundary={(continuation && index === stops.length - 1) || undefined}
            style={
              {
                ...(continuation && index === stops.length - 1
                  ? { '--continuation-color': toeiMapColor(continuation.id) }
                  : {}),
              } as CSSProperties
            }
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
              <span
                className="toei-stop-code"
                aria-label={`駅番号 ${station.code}${station.kind === 'current' ? ' 現在駅' : ''}`}
              >
                <span>{station.code.split('-')[0]}</span>
                <b>{station.code.split('-')[1]}</b>
              </span>
            ) : (
              <span
                className="toei-stop-dash"
                aria-label={station.kind === 'pass' ? '通過' : '現在駅より手前'}
              />
            )}
          </li>
        ))}
        {continuation && (
          <li
            className="toei-stop-continuation"
            style={{ '--continuation-color': toeiMapColor(continuation.id) } as CSSProperties}
          >
            <div>
              <strong>
                <span className="toei-continuation-text">
                  {english ? TOEI_TRANSFER_NAMES_EN[continuation.id] : continuation.name}
                </span>
              </strong>
              {continuation.details.map((detail) => (
                <span className="toei-continuation-detail" key={detail.ja}>
                  <span className="toei-continuation-text">{english ? detail.en : detail.ja}</span>
                </span>
              ))}
            </div>
          </li>
        )}
      </ol>
    </div>
  );
});
