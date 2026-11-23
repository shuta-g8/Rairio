import assert from 'node:assert/strict';
import test from 'node:test';
import { createJourneyHandler } from '../server/journey-api.mjs';
import { resolveJourneyQuery } from '../server/journey-stations.mjs';
import { matchJourneyFares } from '../server/journey-navitime.mjs';
import { transitousPlanUrl, transitousResults } from '../server/journey-transitous.mjs';
import type { JourneyData } from '../shared/journey.ts';
import type { OnlineJourneyLeg } from '../shared/journey-online.ts';
import { confirmedOdptTimes } from '../src/lib/journey-online.ts';

const query = { from: 'kanto:1130105', to: 'gotanda', time: '2026-11-20T10:00' };
const origin = 'https://example.test';
const sample = resolveJourneyQuery(query)!;
const from = {
  name: '横浜 Yokohama',
  ...sample.from.points[0],
  stopId: 'jp-tokyo-rail_JR-East.Tokaido.Yokohama',
};
const change = {
  name: '品川 Shinagawa',
  lat: 35.6288,
  lon: 139.73871,
  stopId: 'jp-tokyo-rail_Shinagawa',
};
const to = {
  name: '五反田 Gotanda',
  ...sample.to.points[0],
  stopId: 'jp-tokyo-rail_JR-East.Yamanote.Gotanda',
};

const transitous = {
  itineraries: [
    {
      transfers: 1,
      legs: [
        {
          from,
          to: change,
          mode: 'REGIONAL_RAIL',
          routeId: 'jp-tokyo-rail_JR-East.Tokaido',
          routeLongName: 'JR東海道線 JR Tōkaidō Line',
          startTime: '2026-11-20T01:02:00Z',
          endTime: '2026-11-20T01:19:00Z',
        },
        {
          from: change,
          to,
          mode: 'REGIONAL_RAIL',
          routeId: 'jp-tokyo-rail_JR-East.Yamanote',
          routeLongName: 'JR山手線 JR Yamanote Line',
          startTime: '2026-11-20T01:21:00Z',
          endTime: '2026-11-20T01:26:00Z',
        },
      ],
    },
  ],
};
const point = (name: string, coord: { lat: number; lon: number }) => ({
  type: 'point',
  name,
  coord,
});
const ride = (line_name: string) => ({ type: 'move', move: 'local_train', line_name });
const navitime = {
  items: [
    {
      sections: [
        point('横浜', from),
        ride('ＪＲ東海道本線（東京-熱海）'),
        point('品川', change),
        ride('ＪＲ山手線'),
        point('五反田', to),
      ],
      summary: { move: { transit_count: 1, fare: { unit_0: 440, unit_48: 434 } } },
    },
  ],
};

const request = (body: object, fromOrigin = origin) =>
  new Request(origin + '/api/journey', {
    method: 'POST',
    headers: { Origin: fromOrigin, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

test('accepts Kanto rail stations in either direction, but requires a verified Toei endpoint', () => {
  assert.ok(sample);
  assert.ok(resolveJourneyQuery({ ...query, from: 'gotanda', to: 'kanto:1131915' })); // Koga, Ibaraki
  assert.ok(resolveJourneyQuery({ ...query, from: 'kanto:9930530', to: 'kanto:1131915' })); // Sakura Tram
  for (const invalid of [
    { from: 'kanto:1130205', to: 'kanto:2800118' }, // Shibuya to Omotesando
    { from: 'kanto:1131915', to: 'kanto:1130105' },
    { to: 'kanto:1130105' },
    { from: 'https://unexpected.example/' },
    { from: 'kanto:1130105:unreviewed' },
    { time: '2026-02-30T10:00' },
    { conventionalOnly: 'false' },
    { conventionalOnly: null },
  ]) {
    assert.equal(resolveJourneyQuery({ ...query, ...invalid }), undefined);
  }
});

test('searches conventional rail by default and only allows Shinkansen when requested', () => {
  const unrestricted = resolveJourneyQuery({ ...query, conventionalOnly: false })!;
  assert.equal(sample.conventionalOnly, true);
  assert.equal(
    transitousPlanUrl(sample).searchParams.get('transitModes'),
    'SUBWAY,SUBURBAN,REGIONAL_RAIL,LONG_DISTANCE,NIGHT_RAIL,TRAM',
  );
  assert.equal(transitousPlanUrl(unrestricted).searchParams.get('transitModes'), 'RAIL,TRAM');
  for (const highSpeed of [
    { mode: 'HIGHSPEED_RAIL' },
    { routeType: 101 },
    { routeLongName: '東海道新幹線' },
  ]) {
    const response = structuredClone(transitous);
    Object.assign(response.itineraries[0].legs[0], highSpeed);
    assert.equal(transitousResults(response, sample).length, 0);
    assert.equal(transitousResults(response, unrestricted).length, 1);
  }
});

test('retains times for unnamed rail routes and extracts real station numbers', () => {
  const response = structuredClone(transitous);
  const [tokaido, yamanote] = response.itineraries[0].legs;
  Object.assign(tokaido, {
    routeId: 'jp-jr_6214611',
    routeLongName: '',
    routeShortName: '6214611',
    agencyName: 'JR',
    routeColor: '9acd32',
    from: { ...from, stopCode: '1234567' },
  });
  Object.assign(yamanote, {
    from: { ...change, stopCode: 'ＪＹ２５' },
    to: { ...to, stopCode: 'JY-23' },
  });
  const [unknown] = transitousResults(response, sample);
  assert.equal(unknown.route.legs[0].line, 'JR（路線名未収録）');
  assert.equal(unknown.route.legs[0].start, Date.parse(tokaido.startTime));
  assert.equal(unknown.route.legs[0].fromCode, undefined);
  assert.equal(unknown.route.legs[0].routeColor, undefined);
  assert.equal(unknown.route.legs[1].fromCode, 'JY-25');
  assert.equal(unknown.route.legs[1].toCode, 'JY-23');
  assert.equal(unknown.fare, undefined);

  Object.assign(tokaido, { routeLongName: '６２１４６１１', routeShortName: 'JR東海道線' });
  const [named] = transitousResults(response, sample);
  assert.equal(named.route.legs[0].line, 'JR東海道線');
  assert.ok(named.fare);
});

test('retains external rail headsigns when provided by Transitous', () => {
  const response = structuredClone(transitous);
  const [tokaido, yamanote] = response.itineraries[0].legs;
  Object.assign(tokaido, { headsign: ' （普通 Local） 小金井行き Koganei ' });
  Object.assign(yamanote, { headsign: '', tripTo: to });

  const [{ route }] = transitousResults(response, sample);
  assert.deepEqual(
    route.legs.map((leg) => leg.headsign),
    ['小金井行き', undefined],
  );
});

test('uses ODPT for an identical train in a mixed route and leaves mismatched or expired data to Transitous', () => {
  const midnight = Date.parse('2026-11-20T00:00:00+09:00');
  const ride: OnlineJourneyLeg = {
    from: '戸越',
    to: '五反田',
    start: midnight + 600 * 60_000,
    end: midnight + 602 * 60_000,
    line: '都営浅草線',
    toei: true,
    toeiLine: 'Asakusa',
    through: false,
    walk: false,
  };
  const feed = {
    startDate: '2026-11-20',
    endDate: '2026-11-22',
    lineEndDates: { Asakusa: '2026-11-21' },
    stops: { a: { name: '戸越', station: 'togoshi' }, b: { name: '五反田', station: 'gotanda' } },
    calendars: [{ id: 'all', start: '2026-11-20', end: '2026-11-22', weekdays: [0, 5, 6] }],
    exceptions: [],
    trips: [
      {
        id: 'sample-trip',
        line: 'Asakusa',
        headsign: '印西牧の原',
        service: 'all',
        stops: [
          ['a', 600, 600, 1],
          ['b', 602, 602, 2],
        ],
      },
    ],
  } as unknown as JourneyData;
  const late = { ...ride, end: ride.end + 60_000 };
  const expired = { ...ride, start: ride.start + 86_400_000, end: ride.end + 86_400_000 };
  const plan = {
    routes: [ride, late, expired].map((leg, id) => ({
      id,
      legs: [leg],
      start: leg.start,
      end: leg.end,
      transfers: 0,
    })),
  };
  const confirmed = confirmedOdptTimes(plan, feed);
  assert.deepEqual([...confirmed.keys()], [ride]);
  assert.equal(confirmed.get(ride)?.fromStation, 'togoshi');
  assert.equal(confirmed.get(ride)?.toStation, 'gotanda');
  assert.deepEqual(confirmed.get(ride)?.journey.legs[0], {
    kind: 'ride',
    line: 'Asakusa',
    trip: 'sample-trip',
    headsign: '印西牧の原',
    from: 'a',
    to: 'b',
    departure: 600,
    arrival: 602,
    stops: 1,
  });
});

test('rejects routes for a nearby wrong station and keeps quotes only for matching routes and prices', () => {
  const candidate = transitousResults(transitous, sample)[0];
  assert.equal(candidate.route.legs[0].line, 'JR東海道線');
  assert.equal(candidate.route.legs[0].railwayId, 'JR-East.Tokaido');
  assert.equal(candidate.route.legs.at(-1).to, '五反田');
  const wrong = structuredClone(transitous);
  wrong.itineraries[0].legs[1].to = { ...to, name: '大崎 Ōsaki' };
  assert.deepEqual(transitousResults(wrong, sample), []);
  assert.deepEqual(matchJourneyFares(navitime.items, [candidate.fare]), [
    { id: 1, ticket: 440, ic: 434 },
  ]);
  const other = structuredClone(navitime.items[0]);
  other.sections[2] = point('品川', { lat: 36.63, lon: 139.74 });
  assert.deepEqual(matchJourneyFares([other], [candidate.fare]), []);
  const conflicting = structuredClone(navitime.items[0]);
  conflicting.summary.move.fare.unit_0 = 500;
  assert.deepEqual(matchJourneyFares([...navitime.items, conflicting], [candidate.fare]), []);
});

test('uses corroborated station IDs for missing coordinates and checks the through-service pattern', () => {
  const candidate = transitousResults(transitous, sample)[0].fare;
  const otherPoint = { type: 'point', name: '品川', node_id: 'station-shinagawa' };
  const [direct] = navitime.items;
  const withoutCoordinate = structuredClone(direct);
  withoutCoordinate.sections[2] = otherPoint as (typeof withoutCoordinate.sections)[number];
  const anchored = {
    sections: [{ ...otherPoint, coord: change }],
  };
  assert.deepEqual(matchJourneyFares([withoutCoordinate], [candidate]), []);
  assert.deepEqual(matchJourneyFares([withoutCoordinate, anchored], [candidate]), [
    { id: 1, ticket: 440, ic: 434 },
  ]);
  const conflictingAnchor = { sections: [{ ...otherPoint, coord: { lat: 36.63, lon: 139.74 } }] };
  assert.deepEqual(
    matchJourneyFares([withoutCoordinate, anchored, conflictingAnchor], [candidate]),
    [],
  );

  const sameTrain = structuredClone(transitous);
  Object.assign(sameTrain.itineraries[0].legs[1], { interlineWithPreviousLeg: true });
  sameTrain.itineraries[0].transfers = 0;
  const route = transitousResults(sameTrain, sample)[0].fare;
  const throughFare = structuredClone(direct);
  throughFare.summary.move.transit_count = 0;
  assert.deepEqual(matchJourneyFares([throughFare], [route]), [{ id: 1, ticket: 440, ic: 434 }]);
  assert.deepEqual(matchJourneyFares([direct], [route]), []);
});

test('matches a through fare when Tokyo–Omiya is reported as Utsunomiya and Takasaki', () => {
  const takanawadai = { name: '高輪台', lat: 35.631, lon: 139.73 };
  const shimbashi = { name: '新橋', lat: 35.667, lon: 139.759 };
  const tokyo = { name: '東京', lat: 35.681, lon: 139.767 };
  const omiya = { name: '大宮', lat: 35.906, lon: 139.624 };
  const eastOmiya = { name: '東大宮', lat: 35.948, lon: 139.641 };
  const item = {
    sections: [
      point(takanawadai.name, takanawadai),
      { ...ride('都営浅草線'), next_transit: true },
      point(shimbashi.name, shimbashi),
      ride('ＪＲ東海道本線（東京-熱海）'),
      point(tokyo.name, tokyo),
      {
        ...ride('ＪＲ高崎線'),
        transport: { links: [{ name: 'ＪＲ宇都宮線〔東北本線〕・ＪＲ上野東京ライン' }] },
      },
      point('大宮（埼玉県）', omiya),
    ],
    summary: { move: { transit_count: 1, fare: { unit_0: 700, unit_48: 690 } } },
  };
  const candidate = {
    id: 2,
    transfers: 1,
    rides: [
      { from: takanawadai, to: shimbashi, line: '都営浅草線', through: false },
      {
        from: shimbashi,
        to: tokyo,
        line: 'JR東海道線',
        routeId: 'jp-tokyo-rail_JR-East.Tokaido',
        through: false,
      },
      {
        from: tokyo,
        to: omiya,
        line: 'JR宇都宮線',
        routeId: 'jp-tokyo-rail_JR-East.Utsunomiya',
        through: true,
      },
    ],
  };
  assert.deepEqual(matchJourneyFares([item], [candidate]), [{ id: 2, ticket: 700, ic: 690 }]);

  const differentTrain = structuredClone(candidate);
  differentTrain.rides[2].through = false;
  assert.deepEqual(matchJourneyFares([item], [differentTrain]), []);

  const outsideSharedTracks = structuredClone(candidate);
  outsideSharedTracks.rides[2].to = eastOmiya;
  const outsideItem = structuredClone(item);
  outsideItem.sections[6] = point(eastOmiya.name, eastOmiya);
  assert.deepEqual(matchJourneyFares([outsideItem], [outsideSharedTracks]), []);
});

test('recognizes the official ODPT feed in Transitous as well as Tokyo Rail', () => {
  const query = resolveJourneyQuery({ from: 'togoshi', to: 'gotanda', time: '2026-11-20T09:00' })!;
  const route = {
    legs: [
      {
        from: { name: '戸越', ...query.from.points[0] },
        to: { name: '五反田', ...query.to.points[0] },
        mode: 'SUBWAY',
        agencyId: 'toei',
        routeId: 'jp-Toei-Train_1',
        routeLongName: '都営浅草線',
        headsign: '(普通 Local) 泉岳寺 Sengakuji',
        routeColor: 'EC6E65',
        startTime: '2026-11-20T00:02:00Z',
        endTime: '2026-11-20T00:04:00Z',
      },
    ],
    transfers: 0,
  };
  const [{ route: matched }] = transitousResults({ itineraries: [route] }, query);
  assert.equal(matched.legs[0].toeiLine, 'Asakusa');
  assert.equal(matched.legs[0].line, '都営浅草線');
  assert.equal(matched.legs[0].headsign, '泉岳寺');
  assert.equal(matched.legs[0].routeColor, '#ec6e65');
});

test('a search calls only Transitous, then a signed result permits one batched fare request', async () => {
  const calls: string[] = [];
  let itineraryResponse = transitous;
  const spent = new Set<string>();
  const key = crypto.randomUUID();
  const env = {
    JOURNEY_TRANSITOUS_ENABLED: '1',
    JOURNEY_FARES_ENABLED: '1',
    NAVITIME_RAPIDAPI_KEY: key,
    JOURNEY_FARE_SIGNING_SECRET: crypto.randomUUID(),
    JOURNEY_BUDGET: {
      getByName: () => ({
        async fetch(input: Request) {
          if (input.url.endsWith('/plan')) return new Response(null, { status: 204 });
          const id = await input.text();
          if (spent.has(id)) return new Response(null, { status: 409 });
          spent.add(id);
          return new Response(null, { status: 204 });
        },
      }),
    },
  };
  const handler = createJourneyHandler(async (url: URL, init: RequestInit) => {
    calls.push(url.hostname);
    const headers = new Headers(init.headers);
    assert.equal(init.redirect, 'manual');
    assert.equal(init.cache, 'no-store');
    if (url.hostname === 'api.transitous.org') {
      assert.match(headers.get('User-Agent')!, /Rairio\/[\d.]+ .*rairio\.jp/);
      assert.equal(headers.get('X-RapidAPI-Key'), null);
      assert.equal(url.searchParams.get('withFares'), 'false');
      return Response.json(itineraryResponse);
    }
    assert.equal(url.hostname, 'navitime-route-totalnavi.p.rapidapi.com');
    assert.equal(headers.get('X-RapidAPI-Key'), key);
    assert.equal(url.searchParams.get('unuse'), 'superexpress_train');
    return Response.json(navitime);
  });
  assert.equal(
    (await handler({ request: request({ action: 'plan', ...query }, 'https://other.test'), env }))
      .status,
    403,
  );
  assert.equal(
    (await handler({ request: request({ action: 'plan', ...query }), env: {} })).status,
    503,
  );
  assert.equal(
    (await handler({ request: request({ action: 'plan', ...query, to: 'kanto:1131915' }), env }))
      .status,
    400,
  );
  assert.deepEqual(calls, []);
  const disabled = await handler({
    request: request({ action: 'plan', ...query }),
    env: { ...env, JOURNEY_FARES_ENABLED: '0' },
  });
  const disabledResult = await disabled.json();
  assert.equal(disabledResult.fareAvailability, 'disabled');
  assert.equal(disabledResult.routes.length, 1);
  assert.equal(disabledResult.fareToken, undefined);
  itineraryResponse = structuredClone(transitous);
  Object.assign(itineraryResponse.itineraries[0].legs[1], { interlineWithPreviousLeg: true });
  const noCandidate = await handler({ request: request({ action: 'plan', ...query }), env });
  const incomplete = await noCandidate.json();
  assert.equal(incomplete.fareAvailability, 'no-candidate');
  assert.equal(incomplete.routes.length, 1);
  assert.equal(incomplete.fareToken, undefined);
  assert.deepEqual(calls.splice(0), ['api.transitous.org', 'api.transitous.org']);
  itineraryResponse = transitous;
  const plan = await handler({ request: request({ action: 'plan', ...query }), env });
  assert.equal(plan.status, 200);
  const body = await plan.json();
  assert.equal(body.fareAvailability, 'ready');
  assert.equal(body.routes.length, 1);
  assert.equal(body.routes[0].fare, undefined);
  assert.deepEqual(calls, ['api.transitous.org']);
  const tampered = (body.fareToken.startsWith('a') ? 'b' : 'a') + body.fareToken.slice(1);
  assert.equal(
    (await handler({ request: request({ action: 'fare', token: tampered }), env })).status,
    400,
  );
  const fareRequest = () =>
    handler({ request: request({ action: 'fare', token: body.fareToken }), env });
  const responses = await Promise.all([fareRequest(), fareRequest()]);
  assert.deepEqual(responses.map((response) => response.status).sort(), [200, 409]);
  const fare = responses.find((response) => response.ok)!;
  assert.match(fare.headers.get('Cache-Control')!, /no-store/);
  assert.deepEqual(await fare.json(), { fares: [{ id: 1, ticket: 440, ic: 434 }] });
  assert.deepEqual(calls, ['api.transitous.org', 'navitime-route-totalnavi.p.rapidapi.com']);
});
