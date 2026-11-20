import type { JourneyData } from '../../shared/journey.ts';
import { journeyRequest, searchJourneys, type Journey } from './journey.ts';
import { guidanceConnections, type GuidanceConnection } from './journey-guidance.ts';
import { excludeClearDetours, rankStationJourneys, type RankedJourney } from './journey-ranking.ts';
import { isExternalJourneyPlace, placeName } from './journey-place-search.ts';
import { KANTO_NETWORK } from './kanto-network.ts';

export interface JourneySearchInput {
  from: string;
  to: string;
  date: string;
  time: string;
  conventionalOnly?: boolean;
}

export interface JourneySearchState extends JourneySearchInput {
  inbound: boolean;
  external: boolean;
  results: RankedJourney[];
  message?: string;
}

interface MixedJourney extends RankedJourney {
  journey: Journey;
  guidance: GuidanceConnection;
  boundary: string;
}

function mixedScore(option: MixedJourney, start: number) {
  // External travel/wait times are unknown; this is not a total arrival-time ranking.
  return (option.journey.arrival - start) / 3 + (option.guidance.score ?? 0);
}

function dominates(a: MixedJourney, b: MixedJourney) {
  return (
    a.journey.arrival <= b.journey.arrival &&
    (a.guidance.changes ?? 0) <= (b.guidance.changes ?? 0) &&
    (a.guidance.distance ?? 0) <= (b.guidance.distance ?? 0) &&
    (a.journey.arrival < b.journey.arrival ||
      (a.guidance.changes ?? 0) < (b.guidance.changes ?? 0) ||
      (a.guidance.distance ?? 0) < (b.guidance.distance ?? 0))
  );
}

function searchMixedJourneys(
  data: JourneyData,
  input: JourneySearchInput,
  inbound: boolean,
): RankedJourney[] {
  const request = journeyRequest(input.date, input.time);
  const connections = guidanceConnections(inbound ? input.from : input.to, inbound);
  const toeiStation = inbound ? input.to : input.from;
  const direct = connections.find((c) => c.station === toeiStation);
  const candidates: MixedJourney[] = [];
  for (const connection of connections) {
    if (connection.station === toeiStation) continue;
    const [journey] = searchJourneys(
      data,
      inbound ? connection.station : toeiStation,
      inbound ? toeiStation : connection.station,
      request.date,
      request.minutes,
      1,
    );
    if (journey) candidates.push({ journey, guidance: connection, boundary: connection.station });
  }
  candidates.sort(
    (a, b) =>
      mixedScore(a, request.minutes) - mixedScore(b, request.minutes) ||
      (a.guidance.changes ?? 0) - (b.guidance.changes ?? 0) ||
      (a.guidance.distance ?? 0) - (b.guidance.distance ?? 0) ||
      (a.guidance.stops ?? 0) - (b.guidance.stops ?? 0) ||
      a.journey.arrival - b.journey.arrival,
  );
  const useful = candidates.filter(
    (candidate) => !candidates.some((other) => other !== candidate && dominates(other, candidate)),
  );
  return [...(direct ? [{ guidance: direct, boundary: toeiStation }] : []), ...useful.slice(0, 3)];
}

/** Build the complete search result without depending on React or browser state. */
export function searchJourneyOptions(
  data: JourneyData,
  input: JourneySearchInput,
): JourneySearchState {
  const { from, to, date, time } = input;
  const inbound = isExternalJourneyPlace(from);
  const external = inbound || isExternalJourneyPlace(to);
  const request = journeyRequest(date, time);
  const state: JourneySearchState = {
    from: placeName(from),
    to: placeName(to),
    date,
    time,
    inbound,
    external,
    results: [],
  };
  if (request.date < data.startDate || request.date > data.endDate) {
    state.message = `この日の時刻表は未収録です。収録期間：${data.startDate}〜${data.endDate}（営業日）。`;
  } else if (
    external &&
    (inbound
      ? KANTO_NETWORK.toei[to] === from.slice(6).split(':')[0]
      : KANTO_NETWORK.toei[from] === to.slice(6).split(':')[0])
  ) {
    state.message = '出発駅と到着駅は同じ駅・乗換駅グループです。';
  } else if (!external) {
    if (from === to) state.message = '出発駅と到着駅に別の駅を選んでください。';
    else
      state.results = rankStationJourneys(
        data,
        searchJourneys(data, from, to, request.date, request.minutes, 5),
        from,
        to,
      );
  } else state.results = searchMixedJourneys(data, input, inbound);
  state.results = excludeClearDetours(data, state.results);
  state.external = state.results.some((r) => Boolean(r.guidance));
  if (!state.results.length && !state.message)
    state.message =
      '指定時刻以降、この営業日内の候補が見つかりませんでした。終電後・未収録のダイヤ、または対応範囲外の経路の可能性があります。日付や時刻を変えて検索してください。';
  return state;
}
