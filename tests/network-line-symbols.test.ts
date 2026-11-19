import test from 'node:test';
import assert from 'node:assert/strict';
import { KANTO_NETWORK, networkLineSymbol } from '../src/lib/kanto-network.ts';
import { NETWORK_LINE_REVIEWS } from '../src/lib/network-line-symbols.ts';
import { RAILWAY_SYMBOLS } from '../src/lib/railway-symbols.ts';
import { lineSymbol } from '../src/lib/stations.ts';

test('収録する全路線を明示的に確認し、名前の推測やデータ提供元の仮色を使わない', () => {
  assert.deepEqual(
    Object.keys(NETWORK_LINE_REVIEWS).sort(),
    KANTO_NETWORK.lines.map((l) => l.id).sort(),
  );
  for (const line of KANTO_NETWORK.lines) {
    const review = NETWORK_LINE_REVIEWS[line.id];
    assert.match(review.source, /^https:\/\//);
    const symbol = networkLineSymbol(line.id)!;
    assert.match(symbol.color, /^#[0-9a-f]{6}$/);
    if (review.railwayId) assert.deepEqual(symbol, RAILWAY_SYMBOLS[review.railwayId], line.name);
    else {
      assert.equal(symbol.code, '', line.name);
      assert.ok(review.note, line.name);
    }
  }
  assert.equal(networkLineSymbol('missing'), undefined);
});

test('都営・メトロ・JR・各私鉄の代表路線に正しい記号を割り当てる', () => {
  for (const [id, code] of Object.entries({
    '99301': 'E',
    '99302': 'A',
    '99303': 'I',
    '99304': 'S',
    '99305': 'SA',
    '99342': 'NT',
    '28001': 'G',
    '28002': 'M',
    '28003': 'H',
    '28004': 'T',
    '28005': 'C',
    '28006': 'Y',
    '28008': 'Z',
    '28009': 'N',
    '28010': 'F',
    '11302': 'JY',
    '11303': 'JN',
    '11305': 'JM',
    '11306': 'JH',
    '11307': 'JK',
    '11326': 'JE',
    '22001': 'SI',
    '22007': 'SS',
    '22010': 'SK',
    '22011': 'ST',
    '22012': 'SW',
    '22006': 'SY',
    '26001': 'TY',
    '26003': 'DT',
    '26006': 'TM',
    '26007': 'SG',
    '26008': 'KD',
    '26009': 'SH',
    '25002': 'OE',
    '25003': 'OT',
    '24006': 'IN',
    '29004': 'SO',
    '21001': 'TJ',
    '21004': 'TD',
    '99329': 'KS',
    '99337': 'R',
    '99338': 'TR',
    '99340': 'HS',
    '99334': 'TT',
    '99326': 'SMR',
  }))
    assert.equal(networkLineSymbol(id)?.code, code, id);
});

test('Web公式路線記号の色を各画面で共用し、曖昧な系統に偽の記号を作らない', () => {
  assert.equal(networkLineSymbol('28001')?.color, '#ff9500');
  assert.equal(networkLineSymbol('28003')?.color, '#b5b5ac');
  assert.equal(networkLineSymbol('22001')?.color, '#ff710a');
  assert.equal(networkLineSymbol('26001')?.color, '#db0042');
  for (const id of ['11311', '11314', '11343', '21002', '99317'])
    assert.equal(networkLineSymbol(id)?.code, '');
  assert.equal(lineSymbol('JR湘南新宿ライン'), 'JS');
  assert.equal(lineSymbol('西武新宿線'), 'SS');
  assert.equal(lineSymbol('都営新宿線'), 'S');
  assert.equal(lineSymbol('未知の路線'), '');
});
