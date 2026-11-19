import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import type { StationData } from '../src/types.ts';
import { toeiStopGuide } from '../src/lib/toei-stops.ts';
import { toeiDiagramDirection } from '../src/lib/toei-diagram.ts';

test('大江戸線のE-28/E-01境界で番号の大小が逆転しても、表示方向は方面で保つ', () => {
  for (const [stationId, routeId, destination, codes, direction] of [
    ['tochomae', 'Oedo.OuterLoop', '清澄白河', ['E-28', 'E-01'], 'right'],
    ['shinjukunishiguchi', 'Oedo.InnerLoop', '都庁前', ['E-01', 'E-28'], 'left'],
    ['tochomae', 'Oedo.Toei.Hikarigaoka', '光が丘', ['E-28', 'E-29'], 'right'],
  ] as const) {
    const data: StationData = JSON.parse(readFileSync(`public/data/${stationId}.json`, 'utf8'));
    const route = data.routes.find((route) => route.id === `Toei.${routeId}`)!;
    const guide = toeiStopGuide(route, { destination, type: '普通' })!;
    assert.deepEqual(
      guide.stations.slice(0, 2).map((stop) => stop.code),
      codes,
    );
    assert.equal(toeiDiagramDirection(route), direction);
  }
});
