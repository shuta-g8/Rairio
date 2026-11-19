import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  searchJourneys,
  serviceTrips,
  journeyRequest,
  journeyFare,
  journeyTime,
} from '../src/lib/journey.ts';
import { guidanceConnections } from '../src/lib/journey-guidance.ts';
import { STATIONS } from '../shared/stations.ts';
import { fareKey, type JourneyData } from '../shared/journey.ts';

const data: JourneyData = JSON.parse(
  readFileSync(new URL('../public/journey/toei.json', import.meta.url), 'utf8'),
);

test('都営全駅を収録し、全駅対の運賃（徒歩接続のみの東日本橋〜馬喰横山を除く）がある', () => {
  assert.equal(new Set(Object.values(data.stops).map((s) => s.station)).size, 99);
  for (const a of STATIONS)
    for (const b of STATIONS) {
      if (a.id === b.id || fareKey(a.id, b.id) === fareKey('higashinihombashi', 'bakuroyokoyama'))
        continue;
      assert.ok(data.fares[fareKey(a.id, b.id)] > 0, `${a.name} → ${b.name}`);
    }
});

test('戸越〜勝どきは大門で乗換、実在する便の時刻と通算運賃を表示する', () => {
  const results = searchJourneys(data, 'togoshi', 'kachidoki', '2026-11-17', 540);
  assert.equal(results.length, 3);
  const first = results[0];
  assert.equal(first.icFare, 272);
  assert.deepEqual(
    first.legs.map((l) => l.kind),
    ['ride', 'walk', 'ride'],
  );
  assert.equal(data.stops[first.legs[0].to].station, 'daimon');
  assert.equal(first.legs[1].arrival - first.legs[1].departure, 8);
  for (const journey of results) {
    let last = 540;
    for (const leg of journey.legs) {
      assert.ok(leg.departure >= last);
      assert.ok(leg.arrival >= leg.departure);
      if (leg.kind === 'ride') {
        const trip = data.trips.find((t) => t.id === leg.trip)!;
        assert.ok(trip.stops.some((s) => s[0] === leg.from && s[2] === leg.departure && s[3] & 1));
        assert.ok(trip.stops.some((s) => s[0] === leg.to && s[1] === leg.arrival && s[3] & 2));
      }
      last = leg.arrival;
    }
  }
  assert.ok(results[1].departure > results[0].departure);
});

test('五反田〜新橋の都営区間は220円、他社区間の料金を合算しない', () => {
  assert.equal(searchJourneys(data, 'gotanda', 'shimbashi', '2026-11-17', 540)[0].icFare, 220);
});

test('平日・土休日・祝日例外をGTFSから適用する', () => {
  assert.ok(serviceTrips(data, '2026-11-17').every((t) => t.service === '0'));
  assert.ok(serviceTrips(data, '2026-11-14').every((t) => t.service === '1'));
  assert.ok(serviceTrips(data, '2026-11-03').every((t) => t.service === '1'));
  assert.equal(serviceTrips(data, '2027-03-13').length, 0);
});

test('浅草線の未確認ダイヤへ旧データを延長しない。他線は検索できる', () => {
  assert.equal(searchJourneys(data, 'togoshi', 'kachidoki', '2026-11-21', 540).length, 0);
  assert.ok(searchJourneys(data, 'shinjuku', 'kachidoki', '2026-11-21', 540).length > 0);
});

test('深夜は前営業日の24時台として検索し、終電後の便を捏造しない', () => {
  assert.deepEqual(journeyRequest('2026-11-18', '00:30'), { date: '2026-11-17', minutes: 1470 });
  assert.equal(journeyTime(1470), '翌00:30');
  assert.equal(searchJourneys(data, 'togoshi', 'kachidoki', '2026-11-17', 1620).length, 0);
  assert.throws(() => journeyRequest('2026-02-30', '09:00'));
  assert.throws(() => journeyRequest('2026-11-17', '25:00'));
});

test('IC・きっぷ・小児の端数処理、運賃未確認を扱う', () => {
  assert.equal(journeyFare(272, 'paper', false), 280);
  assert.equal(journeyFare(272, 'ic', true), 136);
  assert.equal(journeyFare(325, 'paper', true), 170);
  assert.equal(journeyFare(325, 'ic', true), 162);
  assert.equal(journeyFare(undefined, 'ic', false), undefined);
});

test('山手線の直接経路と新橋接続を案内し、逆方向も正しく扱う', () => {
  const outgoing = guidanceConnections('jr:東京');
  assert.ok(outgoing.find((c) => c.station === 'gotanda'));
  const shimbashi = outgoing.find((c) => c.station === 'shimbashi')!;
  assert.equal(shimbashi.stops, 2);
  assert.match(shimbashi.direction!, /有楽町.*内回り/);
  const incoming = guidanceConnections('jr:東京', true).find((c) => c.station === 'shimbashi')!;
  assert.match(incoming.direction!, /有楽町.*外回り/);
  assert.equal(incoming.from, '東京');
  assert.ok(guidanceConnections('line:Tokyu.Ikegami').some((c) => c.station === 'gotanda'));
});

test('短すぎる接続と降車禁止駅を使わず、乗換時間を満たす後続列車を選ぶ', () => {
  const fixture: JourneyData = {
    ...data,
    stops: {
      a: { station: 'a', name: 'A', line: 'Mita' },
      b: { station: 'b', name: 'B', line: 'Mita' },
      c: { station: 'b', name: 'B', line: 'Oedo' },
      d: { station: 'd', name: 'D', line: 'Oedo' },
    },
    transfers: [{ from: 'b', to: 'c', minutes: 8 }],
    trips: [
      {
        id: 'first',
        line: 'Mita',
        service: '0',
        headsign: 'B',
        stops: [
          ['a', 540, 540, 3],
          ['b', 550, 550, 3],
        ],
      },
      {
        id: 'impossible',
        line: 'Oedo',
        service: '0',
        headsign: 'D',
        stops: [
          ['c', 555, 555, 3],
          ['d', 560, 560, 3],
        ],
      },
      {
        id: 'no-alighting',
        line: 'Oedo',
        service: '0',
        headsign: 'D',
        stops: [
          ['c', 558, 558, 3],
          ['d', 561, 561, 1],
        ],
      },
      {
        id: 'possible',
        line: 'Oedo',
        service: '0',
        headsign: 'D',
        stops: [
          ['c', 560, 560, 3],
          ['d', 565, 565, 3],
        ],
      },
    ],
  };
  const journey = searchJourneys(fixture, 'a', 'd', '2026-11-17', 540, 1)[0];
  assert.equal(journey.arrival, 565);
  assert.equal(journey.legs.at(-1)?.kind === 'ride' && journey.legs.at(-1)?.trip, 'possible');
});

test('出発駅から徒歩接続する経路でも後続候補に同じ列車を重複表示しない', () => {
  const fixture: JourneyData = {
    ...data,
    stops: {
      a: { station: 'a', name: 'A', line: 'Mita' },
      b: { station: 'b', name: 'B', line: 'Oedo' },
      c: { station: 'c', name: 'C', line: 'Oedo' },
    },
    transfers: [{ from: 'a', to: 'b', minutes: 8 }],
    trips: [
      {
        id: 'first',
        line: 'Oedo',
        service: '0',
        headsign: 'C',
        stops: [
          ['b', 560, 560, 3],
          ['c', 570, 570, 3],
        ],
      },
      {
        id: 'second',
        line: 'Oedo',
        service: '0',
        headsign: 'C',
        stops: [
          ['b', 580, 580, 3],
          ['c', 590, 590, 3],
        ],
      },
    ],
  };
  const results = searchJourneys(fixture, 'a', 'c', '2026-11-17', 540);
  assert.equal(results.length, 2);
  assert.deepEqual(
    results.map((j) => j.arrival),
    [570, 590],
  );
});
