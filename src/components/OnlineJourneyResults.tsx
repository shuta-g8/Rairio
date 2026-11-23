import { CaretDownIcon } from '@phosphor-icons/react/dist/csr/CaretDown';
import {
  JourneyMoreResults,
  JourneyResultTools,
  journeyResultsPerPage,
} from './JourneyResultTools';
import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import type { JourneyData } from '../../shared/journey';
import type {
  OnlineJourney,
  OnlineJourneyFare,
  OnlineJourneyLeg,
  OnlineJourneyPlan,
} from '../../shared/journey-online';
import { confirmedOdptTimes, requestOnlineFares } from '../lib/journey-online';
import { onlineJourneyLineId } from '../lib/journey-lines';
import type { JourneySort } from '../lib/journey-sort';
import { AnimatedDetails } from './AnimatedDetails';
import { JourneyRailLabel, JourneySummaryHeading, journeyLineSymbol } from './JourneyLineMark';
import { JourneyRailTrack } from './JourneyRailTrack';
import { JourneyStationNumbers, type JourneyStopNumber } from './JourneyStationNumbers';
import { JourneyStationRow } from './JourneyStationRow';
import { JourneyWalkRow } from './JourneyWalkRow';

const clock = new Intl.DateTimeFormat('ja-JP', {
  timeZone: 'Asia/Tokyo',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});
function time(timestamp: number, searchDate: string) {
  const date = new Date(timestamp + 9 * 3_600_000).toISOString().slice(0, 10);
  return (
    <time dateTime={new Date(timestamp).toISOString()}>
      {date !== searchDate && `${date.slice(5).replace('-', '/')} `}
      {clock.format(timestamp)}
    </time>
  );
}

function stationTimes(searchDate: string, arrival?: number, departure?: number) {
  return (
    <>
      {arrival !== undefined && (
        <span>
          {time(arrival, searchDate)}
          <small>着</small>
        </span>
      )}
      {departure !== undefined && (
        <span>
          {time(departure, searchDate)}
          <small>発</small>
        </span>
      )}
    </>
  );
}

function toeiRank(route: OnlineJourney) {
  const rides = route.legs.filter((leg) => !leg.walk);
  if (rides.every((leg) => leg.toei)) return 0;
  return rides.some((leg) => leg.toei) ? 1 : 2;
}
const routeLabels = ['都営線のみ', '都営線経由', '都営線に乗らない経路'];
function onlineStationNumber(
  leg: OnlineJourneyLeg | undefined,
  end: 'fromCode' | 'toCode',
): JourneyStopNumber | undefined {
  const code = leg?.[end];
  if (!leg || !code) return;
  const symbol = journeyLineSymbol(onlineJourneyLineId(leg));
  if (symbol?.code && /^[A-Z]{1,3}$/.test(symbol.code) && !code.startsWith(`${symbol.code}-`))
    return;
  return { code, line: leg.line, color: symbol?.color };
}

export function OnlineJourneyResults({
  plan,
  timetable,
  searchDate,
  sort,
  onSort,
}: {
  plan: OnlineJourneyPlan;
  timetable?: JourneyData;
  searchDate: string;
  sort: JourneySort;
  onSort: (sort: JourneySort) => void;
}) {
  const [shown, setShown] = useState(journeyResultsPerPage);
  const officialTimes = useMemo(() => confirmedOdptTimes(plan, timetable), [plan, timetable]);
  const [fareState, setFareState] = useState<{
    busy: boolean;
    fares?: OnlineJourneyFare[];
    error?: string;
  }>();
  const fareRequest = useRef<AbortController | null>(null);
  useEffect(() => () => fareRequest.current?.abort(), []);
  async function showFares() {
    if (!plan.fareToken || fareRequest.current) return;
    const controller = new AbortController();
    fareRequest.current = controller;
    setFareState({ busy: true });
    try {
      const fares = await requestOnlineFares(plan.fareToken, controller.signal);
      setFareState({ busy: false, fares });
    } catch (error) {
      if (!controller.signal.aborted)
        setFareState({
          busy: false,
          error: error instanceof Error ? error.message : '運賃を取得できませんでした。',
        });
    }
  }
  const routes = [...plan.routes].sort(
    (a, b) =>
      (sort === 'toei' ? toeiRank(a) - toeiRank(b) : 0) || a.end - b.end || b.start - a.start,
  );
  return (
    <>
      {routes.length ? (
        <JourneyResultTools
          sort={sort}
          onSort={onSort}
          onFares={showFares}
          fareDisabled={!plan.fareToken || Boolean(fareState)}
          fareLabel={fareState?.busy ? '取得中…' : fareState?.fares ? '取得済み' : undefined}
        />
      ) : (
        <p className="journey-empty" role="status">
          指定の駅・日時で案内できる経路が見つかりませんでした。
        </p>
      )}
      {fareState?.error && (
        <p className="journey-notice" role="alert">
          {fareState.error}
        </p>
      )}
      {routes.length > 0 && !plan.fareToken && (
        <p className="journey-data-note">
          {plan.fareAvailability === 'disabled'
            ? 'この環境では運賃APIが無効です。'
            : '運賃の照合に必要な情報が揃った経路がありません。'}
        </p>
      )}
      {fareState?.fares?.length === 0 && (
        <p className="journey-data-note">
          NAVITIMEの応答から、表示中の経路の参考運賃を確認できませんでした。
        </p>
      )}
      {fareState?.fares && fareState.fares.length > 0 && (
        <table className="journey-fare-comparison">
          <caption>検索結果の参考運賃比較</caption>
          <thead>
            <tr>
              <th scope="col">経路（発時刻・路線）</th>
              <th scope="col">IC</th>
              <th scope="col">きっぷ</th>
            </tr>
          </thead>
          <tbody>
            {routes.map((route) => {
              const fare = fareState.fares?.find((item) => item.id === route.id);
              return (
                <tr key={route.id}>
                  <th scope="row">
                    {clock.format(route.start)}　
                    {route.legs
                      .filter((leg) => !leg.walk)
                      .map((leg) => leg.line)
                      .join(' → ')}
                  </th>
                  <td>{fare?.ic == null ? '未確認' : fare.ic + '円'}</td>
                  <td>{fare == null ? '未確認' : fare.ticket + '円'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      {routes.slice(0, shown).map((route, index) => (
        <OnlineRoute
          key={route.id}
          route={route}
          officialTimes={officialTimes}
          searchDate={searchDate}
          index={index}
          fare={fareState?.fares?.find((fare) => fare.id === route.id)}
          faresRequested={fareState?.fares !== undefined}
        />
      ))}
      <JourneyMoreResults
        shown={shown}
        total={routes.length}
        onShowMore={() => setShown((count) => count + journeyResultsPerPage)}
      />
      <p className="journey-data-note">
        経路データ：
        <a href="https://transitous.org/sources/" target="_blank" rel="noreferrer">
          Transitous のデータ出典
        </a>
        {' · '}
        <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">
          © OpenStreetMap contributors
        </a>
        {' · '}
        <a href="https://github.com/shuta-g8/Rairio" target="_blank" rel="noreferrer">
          ソースコード
        </a>
      </p>
      {fareState?.fares && (
        <p className="journey-data-note">
          参考運賃：
          <a href="https://api-sdk.navitime.co.jp/api/" target="_blank" rel="noreferrer">
            NAVITIME API
          </a>
        </p>
      )}
    </>
  );
}

function OnlineRoute({
  route,
  officialTimes,
  searchDate,
  index,
  fare,
  faresRequested,
}: {
  route: OnlineJourney;
  officialTimes: ReturnType<typeof confirmedOdptTimes>;
  searchDate: string;
  index: number;
  fare?: OnlineJourneyFare;
  faresRequested: boolean;
}) {
  const [expanded, setExpanded] = useState(index === 0);
  const getTimes = (leg: OnlineJourneyLeg) => officialTimes.get(leg) ?? leg;
  const lines = route.legs
    .filter((leg) => !leg.walk)
    .map((leg) => ({
      id: onlineJourneyLineId(leg),
      name: leg.line,
      external: !leg.toei,
      color: leg.routeColor,
    }));
  const marks = [
    ...new Map(lines.map((line) => [line.id === 'unknown' ? line.name : line.id, line])).values(),
  ];
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
            <JourneySummaryHeading lines={marks} label={routeLabels[toeiRank(route)]} />
            <strong>
              {time(route.start, searchDate)} <span>→</span> {time(route.end, searchDate)}
            </strong>
            <small className="journey-transfer-count">
              {Math.round((route.end - route.start) / 60_000)}分 · 乗換{route.transfers}回
            </small>
            {faresRequested && (
              <small className="journey-fare-summary">
                {fare
                  ? `きっぷ ${fare.ticket.toLocaleString('ja-JP')}円${fare.ic === undefined ? '' : ` · IC ${fare.ic.toLocaleString('ja-JP')}円`}`
                  : '運賃未確認'}
              </small>
            )}
          </div>
          <CaretDownIcon className="journey-result-toggle" size={20} aria-hidden="true" />
        </>
      }
    >
      <table className="journey-table">
        <caption>候補{index + 1}の経路</caption>
        <colgroup>
          <col className="journey-time-column" />
          <col />
        </colgroup>
        <tbody>
          {route.legs.map((leg, i) => {
            const previous = route.legs[i - 1];
            const next = route.legs[i + 1];
            const { start, end } = getTimes(leg);
            const official = officialTimes.get(leg);
            const officialRide = official?.journey.legs[0];
            const destination =
              (officialRide?.kind === 'ride' && officialRide.headsign) || leg.headsign;
            const direction =
              destination && !/(?:行き?|方面|[回廻]り|循環)$/.test(destination)
                ? `${destination}行`
                : destination;
            const nextOfficial = next?.from === leg.to ? officialTimes.get(next) : undefined;
            const arrivalStation = official?.toStation ?? nextOfficial?.fromStation;
            const arrivalLines = [leg.toeiLine, nextOfficial ? next?.toeiLine : undefined].filter(
              (line) => line !== undefined,
            );
            const lineId = onlineJourneyLineId(leg);
            const startCode = onlineStationNumber(leg, 'fromCode');
            const arrivalCodes = [
              onlineStationNumber(leg, 'toCode'),
              onlineStationNumber(next?.from === leg.to ? next : undefined, 'fromCode'),
            ].filter((code) => code !== undefined);
            return (
              <Fragment key={i}>
                {previous?.to !== leg.from && (
                  <JourneyStationRow
                    name={leg.from}
                    times={stationTimes(searchDate, undefined, start)}
                    numbers={
                      <JourneyStationNumbers
                        stationId={official?.fromStation}
                        lines={leg.toeiLine ? [leg.toeiLine] : undefined}
                        additional={startCode ? [startCode] : undefined}
                      />
                    }
                  />
                )}
                {leg.walk ? (
                  <JourneyWalkRow>
                    徒歩で乗換 · {Math.round((end - start) / 60_000)}分
                  </JourneyWalkRow>
                ) : (
                  <tr className="journey-segment-row">
                    <JourneyRailTrack
                      color={journeyLineSymbol(lineId)?.color ?? leg.routeColor ?? '#687582'}
                    />
                    <td>
                      <JourneyRailLabel id={lineId} name={leg.line} color={leg.routeColor} />
                      {direction && <p className="journey-direction-label">{direction}</p>}
                      <small>乗車{Math.round((end - start) / 60_000)}分</small>
                      {leg.through && <small>乗換なしで直通</small>}
                      {official && <small>時刻表：東京都交通局（ODPT）</small>}
                    </td>
                  </tr>
                )}
                <JourneyStationRow
                  name={leg.to}
                  numbers={
                    <JourneyStationNumbers
                      stationId={arrivalStation}
                      lines={arrivalLines}
                      additional={arrivalCodes}
                    />
                  }
                  times={stationTimes(
                    searchDate,
                    end,
                    next?.from === leg.to ? getTimes(next).start : undefined,
                  )}
                />
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </AnimatedDetails>
  );
}
