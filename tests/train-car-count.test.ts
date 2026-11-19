import test from 'node:test';
import assert from 'node:assert/strict';
import { trainCarCount } from '../src/lib/train-car-count.ts';
import type { Departure, Route } from '../src/types.ts';

test('列車の両数を優先し、両数が混在する路線には固定値を推定しない', () => {
  const route = (railwayId: string, carCount?: number) =>
    ({ railwayId, line: '', carCount }) as Route;
  const train = (carCount?: number) => ({ carCount }) as Departure;
  assert.equal(trainCarCount(route('Oedo'), train()), 8);
  assert.equal(trainCarCount(route('Shinjuku'), train()), 10);
  assert.equal(trainCarCount(route('Mita'), train()), undefined);
  assert.equal(trainCarCount(route('Asakusa'), train()), undefined);
  assert.equal(trainCarCount(route('Mita'), train(6)), 6);
  assert.equal(trainCarCount(route('Mita'), train(8)), 8);
  assert.equal(trainCarCount(route('Asakusa', 8), train(6)), 6);
  assert.equal(trainCarCount(route('Asakusa', 8), train()), 8);
  assert.equal(trainCarCount(route('Mita'), train(0)), undefined);
});
