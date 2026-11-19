import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import type { StationData } from '../src/types.ts';
import { reuseUnchangedRoutes } from '../src/lib/station-refresh.ts';
const station = (): StationData => JSON.parse(fs.readFileSync('public/data/mita.json', 'utf8'));

test('refresh keeps unchanged Asakusa and Mita route sessions while updating station freshness', () => {
  const before = station(),
    after = structuredClone(before);
  after.fetchedAt = '2026-11-13T12:00:00Z';
  const result = reuseUnchangedRoutes(before, after);
  assert.equal(result.fetchedAt, after.fetchedAt);
  for (let i = 0; i < before.routes.length; i++) assert.equal(result.routes[i], before.routes[i]);
});

test('equivalent JSON property order does not discard observation history', () => {
  const before = station(),
    after = structuredClone(before);
  after.routes = after.routes.map(
    (route) => Object.fromEntries(Object.entries(route).reverse()) as typeof route,
  );
  const result = reuseUnchangedRoutes(before, after);
  assert.equal(result.routes[0], before.routes[0]);
});

test('changed train identity or departure time never reuses the old route session', () => {
  const before = station();
  for (const field of ['time', 'trainId'] as const) {
    const after = structuredClone(before);
    after.routes[0].schedules.weekday[0][field] =
      field === 'time' ? '03:59' : 'odpt.Train:Toei.Asakusa.DIFFERENT';
    const result = reuseUnchangedRoutes(before, after);
    assert.equal(result.routes[0], after.routes[0]);
    assert.equal(result.routes[1], before.routes[1]);
  }
});

test('edition verification and expiry changes invalidate only the changed route', () => {
  const before = station();
  before.routes[0].timetableEditions = [
    {
      id: 'asakusa-pre-2026-11-21',
      effectiveFrom: '2025-12-13',
      effectiveToExclusive: '2026-11-21',
      sha256: 'a'.repeat(64),
      schedules: before.routes[0].schedules,
    },
  ];
  const after = structuredClone(before);
  after.routes[0].timetableEditions = [];
  const result = reuseUnchangedRoutes(before, after);
  assert.equal(result.routes[0], after.routes[0]);
  assert.equal(result.routes[1], before.routes[1]);
});

test('station changes, removed routes and route order are respected', () => {
  const before = station(),
    after = structuredClone(before);
  after.routes = [after.routes[2], after.routes[0]];
  const result = reuseUnchangedRoutes(before, after);
  assert.equal(result.routes.length, 2);
  assert.equal(result.routes[0], before.routes[2]);
  assert.equal(result.routes[1], before.routes[0]);
  after.id = 'other-station';
  assert.equal(reuseUnchangedRoutes(before, after), after);
  assert.equal(reuseUnchangedRoutes(null, after), after);
});
