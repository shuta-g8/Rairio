import { yamanoteArc, type NetworkSegment } from './kanto-network.ts';
import { YAMANOTE_STATIONS } from './yamanote-stations.ts';

/** A route direction, not the destination of an identified train. */
export function journeyDirection(segment: NetworkSegment): string {
  if (segment.lineId !== '11302') return `${segment.to}方面`;
  const arc = yamanoteArc(segment.fromId, segment.toId);
  if (!arc) return `${segment.to}方面`;
  const hubs = new Set(['東京', '上野', '池袋', '新宿', '渋谷', '品川']);
  const ahead: string[] = [];
  for (let offset = 1; offset < YAMANOTE_STATIONS.length && ahead.length < 2; offset++) {
    const name =
      YAMANOTE_STATIONS[
        (arc.from + arc.step * offset + YAMANOTE_STATIONS.length) % YAMANOTE_STATIONS.length
      ];
    if (hubs.has(name)) ahead.push(name);
  }
  return `${arc.step === 1 ? '内回り' : '外回り'}・${ahead.join('・')}方面`;
}
