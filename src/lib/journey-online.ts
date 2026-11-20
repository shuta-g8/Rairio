import type { JourneyData, JourneyTrip } from '../../shared/journey.ts';
import type {
  OnlineJourneyFare,
  OnlineJourneyLeg,
  OnlineJourneyPlan,
} from '../../shared/journey-online.ts';
import { journeyRequest, serviceTrips, type Journey } from './journey.ts';
import type { JourneySearchInput } from './journey-search';

type ConfirmedOdptLeg = {
  start: number;
  end: number;
  fromStation: string;
  toStation: string;
  journey: Journey;
};

/** Match one ODPT train without changing the times used for the mixed connection. */
export function confirmedOdptTimes(plan: Pick<OnlineJourneyPlan, 'routes'>, data?: JourneyData) {
  const verified = new Map<OnlineJourneyLeg, ConfirmedOdptLeg>();
  if (!data) return verified;
  const trips = new Map<string, JourneyTrip[]>();
  for (const { legs } of plan.routes) {
    for (const leg of legs) {
      if (!leg.toeiLine) continue;
      const [date, time] = new Date(leg.start + 9 * 3_600_000)
        .toISOString()
        .slice(0, 16)
        .split('T');
      const serviceDate = journeyRequest(date, time).date;
      const midnight = Date.parse(`${serviceDate}T00:00:00+09:00`);
      if (!trips.has(serviceDate)) trips.set(serviceDate, serviceTrips(data, serviceDate));
      let match: ConfirmedOdptLeg | undefined;
      for (const trip of trips.get(serviceDate)!) {
        if (trip.line !== leg.toeiLine) continue;
        const origin = trip.stops.findIndex(
          ([stop, , departure, flags]) =>
            flags & 1 &&
            midnight + departure * 60_000 === leg.start &&
            data.stops[stop]?.name === leg.from,
        );
        if (origin < 0) continue;
        const destination = trip.stops.findIndex(
          ([stop, arrival, , flags], index) =>
            index > origin &&
            flags & 2 &&
            midnight + arrival * 60_000 === leg.end &&
            data.stops[stop]?.name === leg.to,
        );
        if (destination < 0) continue;
        if (match) {
          match = undefined;
          break;
        }
        const [from, , departure] = trip.stops[origin];
        const [to, arrival] = trip.stops[destination];
        match = {
          start: midnight + departure * 60_000,
          end: midnight + arrival * 60_000,
          fromStation: data.stops[from].station,
          toStation: data.stops[to].station,
          journey: {
            serviceDate,
            departure,
            arrival,
            legs: [
              {
                kind: 'ride',
                line: trip.line,
                trip: trip.id,
                headsign: trip.headsign,
                from,
                to,
                departure,
                arrival,
                stops: destination - origin,
              },
            ],
          },
        };
      }
      if (match) verified.set(leg, match);
    }
  }
  return verified;
}

async function requestJourney<T>(data: object, signal: AbortSignal): Promise<T | undefined> {
  const response = await fetch(`${import.meta.env.BASE_URL}api/journey`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
    cache: 'no-store',
    signal,
  });
  if (response.status === 404 || response.status === 405) return undefined;
  const body = await response.json();
  if (body?.code === 'disabled') return undefined;
  if (!response.ok) throw new Error(body?.error || '検索先に接続できません。');
  return body as T;
}

export function requestOnlinePlan(
  { from, to, date, time, conventionalOnly }: JourneySearchInput,
  signal: AbortSignal,
) {
  return requestJourney<OnlineJourneyPlan>(
    { action: 'plan', from, to, time: `${date}T${time}`, conventionalOnly },
    signal,
  ).catch((error: unknown) => {
    if (error instanceof TypeError && !signal.aborted) return undefined;
    throw error;
  });
}

export async function requestOnlineFares(token: string, signal: AbortSignal) {
  const result = await requestJourney<{ fares: OnlineJourneyFare[] }>(
    { action: 'fare', token },
    signal,
  );
  if (!result) throw new Error('運賃検索は準備中です。');
  return result.fares;
}
