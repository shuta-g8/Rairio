import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import type { JourneyData } from '../shared/journey.ts';
import type { StationData } from '../src/types.ts';
import { searchJourneys } from '../src/lib/journey.ts';
import { journeyLcdDeparture, journeyLcdDepartures } from '../src/lib/journey-lcd.ts';

const data: JourneyData = JSON.parse(
  readFileSync(new URL('../public/journey/toei.json', import.meta.url), 'utf8'),
);
const station = (id: string): StationData =>
  JSON.parse(readFileSync(new URL(`../public/data/${id}.json`, import.meta.url), 'utf8'));

test('4路線の検索で選んだ列車を、時刻・行先・進行方向で発車票と照合する', () => {
  for (const [from, to, route, time] of [
    ['togoshi', 'kachidoki', 'Toei.Asakusa.Northbound', '09:02'],
    ['shinjuku', 'shinjukusanchome', 'Toei.Shinjuku.Eastbound', '09:01'],
    ['kachidoki', 'shinjuku', 'Toei.Oedo.OuterLoop', '09:00'],
    ['meguro', 'sugamo', 'Toei.Mita.Northbound', '09:01'],
  ]) {
    const journey = searchJourneys(data, from, to, '2026-11-17', 540)[0];
    const lcd = journeyLcdDeparture(station(from), journey, data);
    assert.equal(lcd?.route.id, route);
    assert.equal(lcd?.departure.time, time);
    assert.equal(lcd?.departure.serviceDate, '2026-11-17');
    assert.ok(lcd?.departure.trainId);
  }
});

test('行先や出発駅が一致しない場合や候補が重複する場合、LCD情報を推測しない', () => {
  const journey = searchJourneys(data, 'togoshi', 'kachidoki', '2026-11-17', 540)[0];
  const source = station('togoshi');
  const lcd = journeyLcdDeparture(source, journey, data)!;
  assert.equal(journeyLcdDeparture(station('gotanda'), journey, data), undefined);
  const wrong = structuredClone(journey);
  assert.equal(wrong.legs[0].kind, 'ride');
  if (wrong.legs[0].kind === 'ride') wrong.legs[0].headsign = '架空の行先';
  assert.equal(journeyLcdDeparture(source, wrong, data), undefined);
  source.routes.push(lcd.route);
  assert.equal(journeyLcdDeparture(source, journey, data), undefined);
});

test('浅草線の羽田空港行は、駅時刻表のターミナル表記と照合する', () => {
  const journey = searchJourneys(data, 'asakusabashi', 'higashinihombashi', '2026-11-20', 541)[0];
  const lcd = journeyLcdDeparture(station('asakusabashi'), journey, data);
  assert.equal(lcd?.departure.time, '09:01');
  assert.equal(lcd?.departure.destination, '羽田空港第１・第２ターミナル(京急)');
  assert.ok(lcd?.departure.trainId);
});

test('検索指定日の列車を照合し、壁時計の先発へ置き換えない', () => {
  const journey = searchJourneys(data, 'togoshi', 'kachidoki', '2026-11-18', 600)[0];
  const lcd = journeyLcdDeparture(station('togoshi'), journey, data)!;
  assert.equal(lcd.departure.serviceDate, '2026-11-18');
  assert.equal(
    lcd.departure.timestamp,
    Date.parse('2026-11-18T00:00:00+09:00') + journey.departure * 60000,
  );
});

test('徒歩乗換と同駅の列車変更の両方で、各乗車駅と選択列車を照合する', () => {
  const stations = new Map(['togoshi', 'sengakuji', 'daimon'].map((id) => [id, station(id)]));
  const journeys = searchJourneys(data, 'togoshi', 'kachidoki', '2026-11-17', 540);
  const first = journeyLcdDepartures(stations, journeys[0], data);
  assert.deepEqual(
    [...first.values()].map((lcd) => [lcd.stationName, lcd.departure.time]),
    [
      ['戸越', '09:02'],
      ['大門', '09:24'],
    ],
  );
  const second = journeyLcdDepartures(stations, journeys[1], data);
  assert.deepEqual(
    [...second.values()].map((lcd) => [lcd.stationName, lcd.departure.time]),
    [
      ['戸越', '09:09'],
      ['泉岳寺', '09:20'],
      ['大門', '09:32'],
    ],
  );
  for (const [leg, lcd] of second) {
    assert.equal(leg.kind, 'ride');
    assert.equal(lcd.stationName, data.stops[leg.from].name);
    assert.equal(
      lcd.departure.timestamp,
      Date.parse('2026-11-17T00:00:00+09:00') + leg.departure * 60000,
    );
  }
});

test('一部の乗換駅データが欠けても、照合できる他の駅のLCDは残す', () => {
  const journey = searchJourneys(data, 'togoshi', 'kachidoki', '2026-11-17', 540)[1];
  const lcds = journeyLcdDepartures(
    new Map([
      ['togoshi', station('togoshi')],
      ['daimon', station('daimon')],
    ]),
    journey,
    data,
  );
  assert.deepEqual(
    [...lcds.values()].map((lcd) => lcd.stationName),
    ['戸越', '大門'],
  );
});
