import { STATIONS } from './stations.ts';
import { KANTO_NETWORK, networkPathsTo, type NetworkSegment } from './kanto-network.ts';

// Station order is factual route information, entered independently; no timetable is copied.
// Source: https://www.jreast.co.jp/map/pdf/map_tokyo.pdf (reviewed 2026-11-17).
import { YAMANOTE_STATIONS } from './yamanote-stations.ts';
export { YAMANOTE_STATIONS } from './yamanote-stations.ts';

export interface GuidanceTarget {
  id: string;
  name: string;
  kind: 'station' | 'line';
}
export interface GuidanceConnection {
  station: string;
  line: string;
  from: string;
  to: string;
  stops?: number;
  direction?: string;
  segments?: NetworkSegment[];
  changes?: number;
  distance?: number;
  walkFrom?: string;
  walkTo?: string;
  score?: number;
}
export const EXTERNAL_LINES: GuidanceTarget[] = [
  ...new Map(
    STATIONS.flatMap((s) =>
      (s.availableRailways || [])
        .filter((r) => !['Toei.Asakusa', 'Toei.Mita', 'Toei.Shinjuku', 'Toei.Oedo'].includes(r.id))
        .map((r) => [r.id, { id: `line:${r.id}`, name: r.name, kind: 'line' as const }] as const),
    ),
  ).values(),
].sort((a, b) => a.name.localeCompare(b.name, 'ja'));

export const EXTERNAL_STATIONS: GuidanceTarget[] = YAMANOTE_STATIONS.map((name) => ({
  id: `jr:${name}`,
  name: `${name}（JR山手線）`,
  kind: 'station',
}));

const jrInterchanges: Record<string, string> = {
  gotanda: '五反田',
  meguro: '目黒',
  mita: '田町',
  daimon: '浜松町',
  shimbashi: '新橋',
  iwamotocho: '秋葉原',
  uenookachimachi: '御徒町',
  sugamo: '巣鴨',
  shinjuku: '新宿',
  yoyogi: '代々木',
};

export function guidanceConnections(target: string, inbound = false): GuidanceConnection[] {
  if (target.startsWith('kanto:')) {
    const [groupId, alias] = target.slice(6).split(':');
    const name = alias ? decodeURIComponent(alias) : undefined;
    const paths = networkPathsTo(groupId);
    return Object.entries(KANTO_NETWORK.toei)
      .flatMap(([station, group]) => {
        const path = paths.get(group);
        if (!path || !path.segments.length) return [];
        const segments = inbound
          ? [...path.segments]
              .reverse()
              .map((s) => ({ ...s, from: s.to, to: s.from, fromId: s.toId, toId: s.fromId }))
          : path.segments;
        return [
          {
            station,
            line: segments[0].line,
            from: segments[0].from,
            to: segments.at(-1)!.to,
            segments,
            changes: path.changes,
            distance: path.distance,
            score: path.score,
            walkFrom: inbound ? name : undefined,
            walkTo: inbound ? undefined : name,
          },
        ];
      })
      .sort((a, b) => a.score - b.score);
  }
  if (target.startsWith('line:')) {
    const id = target.slice(5);
    return STATIONS.filter((s) => s.availableRailways?.some((r) => r.id === id)).map((s) => ({
      station: s.id,
      line: s.availableRailways!.find((r) => r.id === id)!.name,
      from: inbound ? '他社線' : s.name,
      to: inbound ? s.name : '他社線',
    }));
  }
  const name = target.slice(3),
    destination = YAMANOTE_STATIONS.indexOf(name);
  if (destination < 0) return [];
  return Object.entries(jrInterchanges)
    .filter(([id]) => STATIONS.some((s) => s.id === id))
    .map(([station, interchange]) => {
      const from = inbound ? destination : YAMANOTE_STATIONS.indexOf(interchange);
      const to = inbound ? YAMANOTE_STATIONS.indexOf(interchange) : destination;
      const outward = (to - from + 30) % 30,
        inward = (from - to + 30) % 30;
      const step = outward < inward ? 1 : -1;
      return {
        station,
        line: 'JR山手線',
        from: YAMANOTE_STATIONS[from],
        to: YAMANOTE_STATIONS[to],
        stops: Math.min(outward, inward),
        direction: `${YAMANOTE_STATIONS[(from + step + 30) % 30]}方面（${step === 1 ? '内回り' : '外回り'}）`,
      };
    })
    .sort((a, b) => a.stops - b.stops);
}
