import { STATIONS } from './stations.ts';
import { KANTO_NETWORK, PREFECTURES } from './kanto-network.ts';
import { servesToeiSurfaceRail } from '../../shared/journey-online.ts';
export const JOURNEY_PLACES = [
  ...STATIONS.map((s) => ({
    id: s.id,
    name: s.name,
    english: s.english,
    search: `${s.name} ${s.reading} ${s.english} `,
    lines: (s.memberships || []).map((m) => `Toei.${m.railwayId}`),
    detail: '都営地下鉄',
    toei: true,
  })),
  ...KANTO_NETWORK.stations
    .filter((s) => s.lines.some((l) => !['99301', '99302', '99303', '99304'].includes(l)))
    .flatMap((s) =>
      [...new Set([s.name, ...s.names])].map((name) => ({
        id: `kanto:${s.id}${name === s.name ? '' : `:${encodeURIComponent(name)}`}`,
        name: `${name}（${PREFECTURES[s.pref]}）`,
        english: name === s.name ? s.english[0] || '' : '',
        search: [name, ...(name === s.name ? [...s.reading, ...s.english] : [])].join(' '),
        lines: s.lines
          .filter((l) => !['99301', '99302', '99303', '99304'].includes(l))
          .slice(0, 4)
          .map((l) => `network:${l}`),
        detail: servesToeiSurfaceRail(s.lines) ? '東京都交通局' : '鉄道駅',
        toei: servesToeiSurfaceRail(s.lines),
      })),
    ),
];
const placesById = new Map(JOURNEY_PLACES.map((place) => [place.id, place]));
export const findJourneyPlace = (id: string) => placesById.get(id);
export const journeyPlaceName = (name: string) =>
  name.replace(/（(?:東京都|神奈川県|埼玉県|千葉県|茨城県|栃木県|群馬県)）$/, '');
export const placeName = (id: string) => journeyPlaceName(findJourneyPlace(id)?.name || '');
export const isExternalJourneyPlace = (id: string) =>
  id.startsWith('kanto:') || id.startsWith('jr:') || id.startsWith('line:');
export const normalizeJourneyPlace = (s: string) =>
  s
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60))
    .replace(/\s/g, '');

export function searchJourneyPlaces(query: string) {
  const needle = normalizeJourneyPlace(query.replace(/[（(][^）)]*[）)]/g, ''));
  if (!needle) return [];
  return JOURNEY_PLACES.filter((p) => normalizeJourneyPlace(p.search).includes(needle)).sort(
    (a, b) => {
      const rank = (p: typeof a) =>
        normalizeJourneyPlace(p.name.split('（')[0]) === needle
          ? 0
          : normalizeJourneyPlace(p.name).startsWith(needle)
            ? 1
            : 2;
      return rank(a) - rank(b);
    },
  );
}
export function exactJourneyPlace(query: string) {
  const needle = normalizeJourneyPlace(query);
  if (!needle) return undefined;
  const displayMatch = JOURNEY_PLACES.find((p) => normalizeJourneyPlace(p.name) === needle);
  if (displayMatch) return displayMatch;
  const baseMatches = JOURNEY_PLACES.filter(
    (p) => normalizeJourneyPlace(p.name.split('（')[0]) === needle,
  );
  return baseMatches.length === 1 ? baseMatches[0] : undefined;
}
