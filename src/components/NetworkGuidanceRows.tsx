import { Fragment } from 'react';
import type { GuidanceConnection } from '../lib/journey-guidance';
import { networkLineSymbol } from '../lib/kanto-network';
import { JourneyRailTrack } from './JourneyRailTrack';
import { JourneyLineMark } from './JourneyLineMark';
import { journeyDirection } from '../lib/journey-direction';
import { JourneyWalkRow } from './JourneyWalkRow';
import { JourneyStationRow } from './JourneyStationRow';

export function NetworkGuidanceRows({
  connection,
  boundary,
  inbound,
  connectToToei,
}: {
  connection: GuidanceConnection;
  boundary: string;
  inbound: boolean;
  connectToToei: boolean;
}) {
  const segments = connection.segments || [];
  return (
    <>
      {segments.map((segment, i) => (
        <Fragment key={`${segment.lineId}-${i}`}>
          {i === 0 && inbound && connection.walkFrom && (
            <>
              <JourneyStationRow
                contentColSpan={connectToToei ? 2 : 1}
                name={connection.walkFrom}
                external
              />
              <JourneyWalkRow contentColSpan={connectToToei ? 2 : 1}>
                {connection.walkFrom}から{segment.from}へ徒歩連絡
              </JourneyWalkRow>
            </>
          )}
          {i === 0 && !inbound && connectToToei && (
            <JourneyWalkRow contentColSpan={connectToToei ? 2 : 1}>
              {boundary}から{segment.from}の乗換先ホームへ移動
            </JourneyWalkRow>
          )}
          {(i === 0 || segments[i - 1].toId !== segment.fromId) && (
            <JourneyStationRow
              contentColSpan={connectToToei ? 2 : 1}
              name={segment.from}
              external
            />
          )}
          <tr className="journey-guidance-row">
            <JourneyRailTrack color={networkLineSymbol(segment.lineId)?.color}>
              <div className="journey-rail-label">
                <JourneyLineMark id={`network:${segment.lineId}`} />
                <b>{segment.line}</b>
              </div>
            </JourneyRailTrack>
            <td colSpan={connectToToei ? 2 : 1}>
              <span className="journey-tag">経路のみ</span>
              <p className="journey-direction-label">{journeyDirection(segment)}</p>
              {i > 0 && (
                <small>{segment.from}で路線が切り替わります（直通・乗換の有無は未確認）</small>
              )}
              <small>この区間の時刻・運賃は未案内</small>
            </td>
          </tr>
          <JourneyStationRow contentColSpan={connectToToei ? 2 : 1} name={segment.to} external />
          {i === segments.length - 1 && !inbound && connection.walkTo && (
            <>
              <JourneyWalkRow contentColSpan={connectToToei ? 2 : 1}>
                {segment.to}から{connection.walkTo}へ徒歩連絡
              </JourneyWalkRow>
              <JourneyStationRow
                contentColSpan={connectToToei ? 2 : 1}
                name={connection.walkTo}
                external
              />
            </>
          )}
          {i === segments.length - 1 && inbound && connectToToei && (
            <JourneyWalkRow contentColSpan={connectToToei ? 2 : 1}>
              {segment.to}から{boundary}の都営線へ乗換（徒歩移動あり）
            </JourneyWalkRow>
          )}
        </Fragment>
      ))}
    </>
  );
}
