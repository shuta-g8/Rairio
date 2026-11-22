import type { JourneyData } from '../../shared/journey';
import type { Journey } from '../lib/journey';
import { journeyTime } from '../lib/journey';
import { buildJourneyRouteRows } from '../lib/journey-route-rows';
import { RAILWAY_SYMBOLS } from '../lib/railway-symbols';
import { JourneyRailTrack } from './JourneyRailTrack';
import { JourneyRailLabel } from './JourneyLineMark';
import { JOURNEY_LINES } from '../../shared/journey';
import { JourneyStationNumbers } from './JourneyStationNumbers';
import { JourneyWalkRow } from './JourneyWalkRow';
import { JourneyStationRow } from './JourneyStationRow';
import { JourneyFareRange } from './JourneyFareRange';

export function JourneyRouteRows({
  journey,
  data,
  showTimes = true,
  showFares,
}: {
  journey: Journey;
  data: JourneyData;
  showTimes?: boolean;
  showFares: boolean;
}) {
  const rows = buildJourneyRouteRows(journey, data);
  return (
    <>
      {rows.map((row, i) => {
        if (row.kind === 'station')
          return (
            <JourneyStationRow
              key={i}
              name={row.name}
              contentColSpan={showFares && (i === 0 || i === rows.length - 1) ? 2 : 1}
              transfer={
                showTimes && row.waitMinutes !== undefined
                  ? `列車を乗換 · 待ち時間${row.waitMinutes}分`
                  : undefined
              }
              numbers={<JourneyStationNumbers stationId={row.id} lines={row.lines} />}
              times={
                showTimes ? (
                  <>
                    {row.arrival !== undefined && (
                      <span>
                        <time>{journeyTime(row.arrival)}</time>
                        <small>着</small>
                      </span>
                    )}
                    {row.departure !== undefined && (
                      <span>
                        <time>{journeyTime(row.departure)}</time>
                        <small>発</small>
                      </span>
                    )}
                  </>
                ) : undefined
              }
            />
          );
        const fare =
          showFares && i === 1 ? (
            <JourneyFareRange
              journey={journey}
              rowSpan={rows.length - 2}
              from={data.stops[journey.legs[0].from].name}
              to={data.stops[journey.legs.at(-1)!.to].name}
            />
          ) : null;
        const leg = row.leg;
        if (leg.kind === 'walk')
          return (
            <JourneyWalkRow key={i} fare={fare}>
              徒歩で乗換 · 目安{leg.arrival - leg.departure}分
            </JourneyWalkRow>
          );
        const symbol = RAILWAY_SYMBOLS[`Toei.${leg.line}`];
        return (
          <tr key={i} className={`journey-segment-row${showTimes ? '' : ' journey-untimed-row'}`}>
            <JourneyRailTrack color={symbol?.color} />
            <td>
              <JourneyRailLabel id={`Toei.${leg.line}`} name={JOURNEY_LINES[leg.line].name} />
              {showTimes ? (
                <>
                  {leg.headsign && <p className="journey-direction-label">{leg.headsign}行</p>}
                  <small>
                    {leg.stops}駅 · 乗車{leg.arrival - leg.departure}分
                  </small>
                </>
              ) : (
                <small>接続する列車の時刻は未案内</small>
              )}
            </td>
            {fare}
          </tr>
        );
      })}
    </>
  );
}
