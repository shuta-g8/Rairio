import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { searchJourneys } from '../src/lib/journey.ts';
import { journeyResultLines, onlineJourneyLineId } from '../src/lib/journey-lines.ts';
import type { JourneyData } from '../shared/journey.ts';

const data: JourneyData = JSON.parse(
  readFileSync(new URL('../public/journey/toei.json', import.meta.url), 'utf8'),
);

test('成田エクスプレスは全角表記の路線名からも列車記号を表示する', () => {
  assert.equal(
    onlineJourneyLineId({
      line: 'ＪＲ 成田エクスプレス',
      from: '新宿',
      to: '武蔵小杉',
      start: 0,
      end: 0,
      toei: false,
      through: false,
      walk: false,
    }),
    'JR-East.NaritaExpress',
  );
});

test('同一路線で列車を替えても路線を重複させず乗車順に表示する', () => {
  const journey = searchJourneys(data, 'togoshi', 'kachidoki', '2026-11-17', 540)[1];
  const lines = journeyResultLines({ journey }, false);
  assert.deepEqual(
    lines.map((line) => line.id),
    ['Toei.Asakusa', 'Toei.Oedo'],
  );
  assert.ok(lines.every((line) => !line.external));
});

test('他社線の区間は発着側に合わせた順序で区別する', () => {
  const journey = searchJourneys(data, 'togoshi', 'shimbashi', '2026-11-17', 540)[0];
  const guidance = {
    station: 'shimbashi',
    line: 'JR山手線',
    from: '新橋',
    to: '東京',
    segments: [
      { lineId: '11302', line: 'JR山手線', from: '新橋', to: '東京', fromId: 'a', toId: 'b' },
    ],
  };
  const outbound = journeyResultLines({ journey, guidance }, false);
  assert.deepEqual(
    outbound.map((line) => [line.id, line.external]),
    [
      ['Toei.Asakusa', false],
      ['network:11302', true],
    ],
  );
  assert.deepEqual(
    journeyResultLines({ journey, guidance }, true).map((line) => line.id),
    ['network:11302', 'Toei.Asakusa'],
  );
});
