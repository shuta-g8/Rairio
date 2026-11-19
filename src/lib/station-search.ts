import { STATIONS, stationDisplayName } from './stations.ts';

function normalize(value: string) {
  return value
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\u30a1-\u30f6]/g, (char) => String.fromCharCode(char.charCodeAt(0) - 0x60))
    .replace(/[\s・ー\-\[\]［］()（）]/g, '')
    .replace(/駅$/, '');
}

const stationIndex = STATIONS.map((station) => ({
  station,
  terms: [
    station.name,
    stationDisplayName(station),
    station.english,
    station.reading || '',
    ...(station.aliases || []),
  ].map(normalize),
}));

export function searchStations(query: string) {
  const term = normalize(query);
  const matches = stationIndex
    .filter(({ terms }) => terms.some((value) => value.includes(term)))
    .sort((a, b) => Number(b.terms.includes(term)) - Number(a.terms.includes(term)))
    .map(({ station }) => station);
  return { term, matches };
}
