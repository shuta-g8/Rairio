import type { JourneyData } from '../../shared/journey';
import { useMemo, useState } from 'react';
import { CaretDownIcon } from '@phosphor-icons/react/dist/csr/CaretDown';
import { journeyTime } from '../lib/journey';
import { journeyTransferCount, type RankedJourney } from '../lib/journey-ranking';
import { STATIONS } from '../lib/stations';
import { RAILWAY_SYMBOLS } from '../lib/railway-symbols';
import { JourneyRouteRows } from './JourneyRouteRows';
import { NetworkGuidanceRows } from './NetworkGuidanceRows';
import { JourneyRailTrack } from './JourneyRailTrack';
import { JourneyLineMark } from './JourneyLineMark';
import { AnimatedDetails } from './AnimatedDetails';
import type { StationData } from '../types';
import type { TrainPositionsSnapshot } from '../../shared/train-positions';
import { journeyLcdDepartures } from '../lib/journey-lcd';
import { guidanceLineId, journeyResultLines } from '../lib/journey-lines';

const stationName = (id: string) => STATIONS.find((s) => s.id === id)?.name || id;

export function JourneyResult({
  result,
  data,
  inbound,
  index,
  boardingStations,
  positions,
}: {
  result: RankedJourney;
  data: JourneyData;
  inbound: boolean;
  index: number;
  boardingStations: ReadonlyMap<string, StationData>;
  positions?: TrainPositionsSnapshot | null;
}) {
  const [expanded, setExpanded] = useState(index === 0);
  const external = Boolean(result.guidance);
  const journey = result.journey;
  const lcds = useMemo(
    () => (journey && !inbound ? journeyLcdDepartures(boardingStations, journey, data) : undefined),
    [journey, inbound, boardingStations, data],
  );
  const transfers = journeyTransferCount(result);
  const connection = result.guidance;
  const lineId = connection ? guidanceLineId(connection) : undefined;
  const lines = journeyResultLines(result, inbound);
  const guidance = connection?.segments ? (
    <NetworkGuidanceRows
      connection={connection}
      boundary={stationName(result.boundary!)}
      inbound={inbound}
      connectToToei={Boolean(journey)}
    />
  ) : (
    connection && (
      <tr className="journey-guidance-row">
        <JourneyRailTrack color={lineId ? RAILWAY_SYMBOLS[lineId]?.color : undefined}>
          <div className="journey-rail-label">
            {lineId && <JourneyLineMark id={lineId} />}
            <b>{connection.line}</b>
          </div>
        </JourneyRailTrack>
        <td colSpan={journey ? 2 : 1}>
          <span className="journey-tag">経路のみ</span>
          <p>
            {connection.stops === undefined
              ? inbound
                ? `他社線 → ${stationName(result.boundary!)}で都営線へ乗換`
                : `${stationName(result.boundary!)}で${connection.line}へ乗換`
              : `${connection.from} → ${connection.to}`}
          </p>
          {connection.direction && connection.from !== connection.to && (
            <small>
              {connection.direction} · {inbound ? '都営線へ' : 'JR線へ'}乗換（徒歩移動あり）
            </small>
          )}
          <small>この区間の時刻・運賃は未案内</small>
        </td>
      </tr>
    )
  );
  return (
    <AnimatedDetails
      className="journey-result"
      summaryClassName="journey-summary"
      expanded={expanded}
      onToggle={() => setExpanded((current) => !current)}
      keepMounted
      summary={
        <>
          <strong
            className={`journey-rank${index === 0 ? ' journey-rank-primary' : ''}`}
            aria-label={`候補${index + 1}`}
          >
            {index + 1}
          </strong>
          <div>
            <span className="journey-summary-lines" role="group" aria-label="利用する路線">
              {lines.map((line) => (
                <span
                  key={line.id}
                  className={line.external ? 'journey-summary-external-line' : undefined}
                  title={line.name}
                  role="img"
                  aria-label={line.name}
                >
                  <JourneyLineMark id={line.id} />
                </span>
              ))}
            </span>
            <span className="journey-tag">
              {journey ? (external ? '都営線経由' : '都営線のみ') : '都営線に乗らない経路'}
            </span>
            {journey && !external && (
              <strong>
                {journeyTime(journey.departure)} <span>→</span> {journeyTime(journey.arrival)}
              </strong>
            )}
            <small className="journey-transfer-count">
              {journey && !external ? `${journey.arrival - journey.departure}分 · ` : ''}乗換
              {transfers}回{external ? '（目安）' : ''}
            </small>
          </div>
          <CaretDownIcon className="journey-result-toggle" size={20} aria-hidden="true" />
        </>
      }
    >
      <table className={`journey-table${journey ? ' journey-table-has-fare' : ''}`}>
        <caption className="sr-only">候補{index + 1}の経路と区間運賃</caption>
        <colgroup>
          <col className="journey-time-column" />
          <col />
          {journey && <col className="journey-fare-column" />}
        </colgroup>
        <tbody>
          {inbound && guidance}
          {journey && (
            <JourneyRouteRows
              journey={journey}
              data={data}
              showTimes={!inbound}
              lcds={lcds}
              positions={positions}
            />
          )}
          {!inbound && guidance}
        </tbody>
      </table>
    </AnimatedDetails>
  );
}
