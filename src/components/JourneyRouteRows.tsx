import type { JourneyData } from '../../shared/journey';
import type { Journey, JourneyLeg } from '../lib/journey';
import { journeyTime } from '../lib/journey';
import { buildJourneyRouteRows, type JourneyRouteRow } from '../lib/journey-route-rows';
import { RAILWAY_SYMBOLS } from '../lib/railway-symbols';
import { JourneyRailTrack } from './JourneyRailTrack';
import { JourneyLineMark } from './JourneyLineMark';
import { JOURNEY_LINES } from '../../shared/journey';
import { JourneyStationNumbers } from './JourneyStationNumbers';
import { JourneyWalkRow } from './JourneyWalkRow';
import { JourneyStationRow } from './JourneyStationRow';
import { JourneyFareRange } from './JourneyFareRange';
import type { TrainPositionsSnapshot } from '../../shared/train-positions';
import type { JourneyLcdDeparture } from '../lib/journey-lcd';
import { JourneyDepartureDisplay } from './JourneyDepartureDisplay';

type DisplayRow = JourneyRouteRow | { kind: 'lcd'; lcd: JourneyLcdDeparture };

export function JourneyRouteRows({
  journey,
  data,
  showTimes = true,
  lcds,
  positions,
}: {
  journey: Journey;
  data: JourneyData;
  showTimes?: boolean;
  lcds?: ReadonlyMap<JourneyLeg, JourneyLcdDeparture>;
  positions?: TrainPositionsSnapshot | null;
}) {
  const rows = buildJourneyRouteRows(journey, data).flatMap<DisplayRow>((row) => {
    const lcd =
      showTimes && row.kind === 'segment' && row.leg.kind === 'ride'
        ? lcds?.get(row.leg)
        : undefined;
    return lcd ? [{ kind: 'lcd', lcd }, row] : [row];
  });
  return (
    <>
      {rows.map((row, i) => {
        if (row.kind === 'station')
          return (
            <JourneyStationRow
              key={i}
              name={row.name}
              contentColSpan={i === 0 || i === rows.length - 1 ? 2 : 1}
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
          i === 1 ? (
            <JourneyFareRange
              journey={journey}
              rowSpan={rows.length - 2}
              from={data.stops[journey.legs[0].from].name}
              to={data.stops[journey.legs.at(-1)!.to].name}
            />
          ) : null;
        if (row.kind === 'lcd')
          return (
            <tr key={i} className="journey-lcd-row">
              <td colSpan={2}>
                <JourneyDepartureDisplay lcd={row.lcd} positions={positions} />
              </td>
              {fare}
            </tr>
          );
        const leg = row.leg;
        if (leg.kind === 'walk')
          return (
            <JourneyWalkRow key={i} fare={fare}>
              徒歩で乗換 · 目安{leg.arrival - leg.departure}分
            </JourneyWalkRow>
          );
        const symbol = RAILWAY_SYMBOLS[`Toei.${leg.line}`];
        return (
          <tr key={i} className="journey-segment-row">
            <JourneyRailTrack color={symbol?.color}>
              <div className="journey-rail-label">
                <JourneyLineMark id={`Toei.${leg.line}`} />
                <b>{JOURNEY_LINES[leg.line].name}</b>
              </div>
            </JourneyRailTrack>
            <td>
              {showTimes ? (
                <small>
                  {leg.headsign}行 · {leg.stops}駅<br />
                  乗車{leg.arrival - leg.departure}分
                </small>
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
