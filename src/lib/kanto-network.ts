import raw from '../generated/kanto-network.json' with { type: 'json' };
import { reviewedNetworkLineSymbol } from './network-line-symbols.ts';
import { YAMANOTE_STATIONS } from './yamanote-stations.ts';

export interface NetworkStation {
  id: string;
  name: string;
  names: string[];
  reading: string[];
  english: string[];
  pref: number;
  lat: number;
  lon: number;
  lines: string[];
}
export interface NetworkLine {
  id: string;
  name: string;
  color: string;
  stations: string[];
}
export interface NetworkSegment {
  lineId: string;
  line: string;
  from: string;
  to: string;
  fromId: string;
  toId: string;
}
interface Network {
  version: number;
  fetchedAt: string;
  stations: NetworkStation[];
  lines: NetworkLine[];
  toei: Record<string, string>;
}
export const KANTO_NETWORK = raw as Network;
export const NETWORK_STATIONS = new Map(KANTO_NETWORK.stations.map((s) => [s.id, s]));
export const NETWORK_LINES = new Map(KANTO_NETWORK.lines.map((l) => [l.id, l]));
export const PREFECTURES: Record<number, string> = {
  8: '茨城県',
  9: '栃木県',
  10: '群馬県',
  11: '埼玉県',
  12: '千葉県',
  13: '東京都',
  14: '神奈川県',
};
const TOEI = new Set(['99301', '99302', '99303', '99304']);
// Premium-only Narita Express is not a regular local service alternative.
const EXCLUDED = new Set([...TOEI, '11328']);
export function networkLineSymbol(id: string) {
  return NETWORK_LINES.has(id) ? reviewedNetworkLineSymbol(id) : undefined;
}
const distance = (a: NetworkStation, b: NetworkStation) =>
  Math.hypot((a.lat - b.lat) * 111, (a.lon - b.lon) * 91);
interface Step {
  next: string;
  line: string;
}
export interface NetworkPath {
  segments: NetworkSegment[];
  changes: number;
  distance: number;
  score: number;
}
const BOARDING_PENALTY_KM = 3;
const yamanote = YAMANOTE_STATIONS.map((name) =>
  KANTO_NETWORK.stations.find((s) => s.names.includes(name) && s.lines.includes('11302'))!,
);
export function yamanoteArc(fromId: string, toId: string) {
  const from = yamanote.findIndex((s) => s.id === fromId),
    to = yamanote.findIndex((s) => s.id === toId);
  if (from < 0 || to < 0 || from === to) return undefined;
  let clockwise = 0,
    counterclockwise = 0;
  for (let i = from; i !== to; i = (i + 1) % yamanote.length)
    clockwise += distance(yamanote[i], yamanote[(i + 1) % yamanote.length]);
  for (let i = from; i !== to; i = (i + yamanote.length - 1) % yamanote.length)
    counterclockwise += distance(
      yamanote[i],
      yamanote[(i + yamanote.length - 1) % yamanote.length],
    );
  return {
    distance: Math.min(clockwise, counterclockwise),
    step: clockwise <= counterclockwise ? 1 : -1,
    from,
  };
}
function lineDistance(line: string, a: NetworkStation, b: NetworkStation): number {
  if (line !== '11302') return distance(a, b);
  return yamanoteArc(a.id, b.id)?.distance ?? distance(a, b);
}

/** Membership graph: finds route/transfer suggestions, never trains, stop counts or times. */
export function networkPathsTo(target: string): Map<string, NetworkPath> {
  if (!NETWORK_STATIONS.has(target)) return new Map();
  const costs = new Map([[target, 0]]),
    steps = new Map<string, Step>(),
    done = new Set<string>();
  const queue: [number, string][] = [[0, target]];
  while (queue.length) {
    // Binary heap keeps expanded Kanto search interactive.
    const [cost, id] = pop(queue)!;
    if (done.has(id)) continue;
    done.add(id);
    const station = NETWORK_STATIONS.get(id)!;
    for (const lineId of station.lines) {
      if (EXCLUDED.has(lineId)) continue;
      for (const next of NETWORK_LINES.get(lineId)!.stations) {
        if (next === id || done.has(next)) continue;
        const nextCost =
          cost + BOARDING_PENALTY_KM + lineDistance(lineId, station, NETWORK_STATIONS.get(next)!);
        if (nextCost >= (costs.get(next) ?? Infinity)) continue;
        costs.set(next, nextCost);
        steps.set(next, { next: id, line: lineId });
        push(queue, [nextCost, next]);
      }
    }
  }
  const paths = new Map<string, NetworkPath>();
  for (const [origin, cost] of costs) {
    const segments: NetworkSegment[] = [];
    let cursor = origin;
    while (cursor !== target) {
      const step = steps.get(cursor);
      if (!step) break;
      const from = NETWORK_STATIONS.get(cursor)!,
        to = NETWORK_STATIONS.get(step.next)!;
      segments.push({
        lineId: step.line,
        line: NETWORK_LINES.get(step.line)!.name,
        from: from.name,
        to: to.name,
        fromId: from.id,
        toId: to.id,
      });
      cursor = step.next;
    }
    paths.set(origin, {
      segments,
      changes: Math.max(0, segments.length - 1),
      distance: cost - BOARDING_PENALTY_KM * segments.length,
      score: cost,
    });
  }
  return paths;
}
function push(heap: [number, string][], value: [number, string]) {
  heap.push(value);
  let i = heap.length - 1;
  while (i > 0) {
    const p = (i - 1) >> 1;
    if (heap[p][0] <= value[0]) break;
    heap[i] = heap[p];
    i = p;
  }
  heap[i] = value;
}
function pop(heap: [number, string][]) {
  if (!heap.length) return;
  const first = heap[0],
    last = heap.pop()!;
  if (!heap.length) return first;
  let i = 0;
  while (i * 2 + 1 < heap.length) {
    let child = i * 2 + 1;
    if (child + 1 < heap.length && heap[child + 1][0] < heap[child][0]) child++;
    if (heap[child][0] >= last[0]) break;
    heap[i] = heap[child];
    i = child;
  }
  heap[i] = last;
  return first;
}
