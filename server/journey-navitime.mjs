import { stationDistance, stationNameKey } from './journey-stations.mjs';
import { japaneseLabel } from './journey-transitous.mjs';

export const navitimeHost = 'navitime-route-totalnavi.p.rapidapi.com';

// Reviewed equivalences between the providers. Other routes require identical line names.
const alternateLines = new Map([
  [
    'jp-tokyo-rail_JR-East.Tokaido',
    ['東海道本線(東京-熱海)', '東海道本線(上野東京ライン)', '上野東京ライン'],
  ],
  ['jp-tokyo-rail_JR-East.Yokosuka', ['横須賀線・総武線快速']],
  [
    'jp-tokyo-rail_JR-East.KeihinTohokuNegishi',
    ['京浜東北線・根岸線', '京浜東北・根岸線', '京浜東北線'],
  ],
  ['jp-tokyo-rail_JR-East.Utsunomiya', ['宇都宮線〔東北本線〕（東京-宇都宮）']],
  ['jp-tokyo-rail_JR-East.ShonanShinjuku', ['湘南新宿ライン(宇都宮-逗子)']],
]);
const lineKey = (name) =>
  japaneseLabel(name)
    .normalize('NFKC')
    .replace(/\s+/g, '')
    .replace(/^(?:JR|東京メトロ|都営地下鉄|都営)/, '')
    .replace(/(?:内回り|外回り)$/, '');

const utsunomiyaTakasakiSharedStations = new Set([
  '東京',
  '上野',
  '尾久',
  '赤羽',
  '浦和',
  'さいたま新都心',
  '大宮',
]);

function matchesStation(point, link, expected, points) {
  if (point?.type !== 'point' || (link?.id && point.node_id && link.id !== point.node_id))
    return false;
  const expectedName = stationNameKey(expected.name);
  if (stationNameKey(point.name) !== expectedName) return false;
  if (link?.name && stationNameKey(link.name) !== expectedName) return false;
  if (point.coord != null) return stationDistance(point.coord, expected) <= 500;
  // Link endpoints contain IDs and names. Use coordinates elsewhere in this same
  // response only if the ID and name agree.
  const id = point.node_id ?? link?.id;
  const anchors = id && points.get(id);
  return Boolean(
    anchors?.length &&
    anchors.every(
      (anchor) =>
        stationNameKey(anchor.name) === expectedName &&
        stationDistance(anchor.coord, expected) <= 500,
    ),
  );
}

function matchesRide(section, from, to, expected, points) {
  if (!['local_train', 'rapid_train'].includes(section.move)) return false;
  const { transport } = section;
  const links = Array.isArray(transport?.links) ? transport.links : [];
  const first = links[0];
  const last = links.at(-1);
  const names = [expected.line, ...(alternateLines.get(expected.routeId) ?? [])].map(lineKey);
  // NAVITIME's link names the common track even when the train's line differs.
  if (
    ['jp-tokyo-rail_JR-East.Utsunomiya', 'jp-tokyo-rail_JR-East.Takasaki'].includes(
      expected.routeId,
    ) &&
    [expected.from, expected.to].every(({ name }) =>
      utsunomiyaTakasakiSharedStations.has(stationNameKey(name)),
    )
  )
    names.push(lineKey('宇都宮線〔東北本線〕・ＪＲ上野東京ライン'));
  if (
    links.length > 1 &&
    !links.every(
      (link, index) =>
        names.includes(lineKey(link?.name)) &&
        (index === 0 || (link?.from?.id && link.from.id === links[index - 1]?.to?.id)),
    )
  )
    return false;
  if (
    transport?.fare_detail?.some?.(
      (detail) => detail?.default_extra_fare === true && detail.fare !== 0,
    )
  )
    return false;
  return (
    [section.line_name, last?.name].some((name) => names.includes(lineKey(name))) &&
    matchesStation(from, first?.from, expected.from, points) &&
    matchesStation(to, last?.to, expected.to, points)
  );
}

function price(move) {
  const ticket = move?.reference_fare?.lowest_total_ticket ?? move?.fare?.unit_0;
  const ic = move?.reference_fare?.lowest_total_ic ?? move?.fare?.unit_48;
  if (!Number.isSafeInteger(ticket) || ticket <= 0) return;
  return { ticket, ic: Number.isSafeInteger(ic) && ic > 0 ? ic : undefined };
}

export function matchJourneyFares(items, expected) {
  const quotes = new Map();
  const routes = items.slice(0, 10);
  const points = new Map();
  for (const item of routes) {
    const sections = Array.isArray(item?.sections) ? item.sections.slice(0, 60) : [];
    for (const point of [item?.summary?.start, item?.summary?.goal, ...sections]) {
      if (point?.type !== 'point' || !point.node_id || point.coord == null) continue;
      const anchors = points.get(point.node_id) ?? [];
      anchors.push(point);
      points.set(point.node_id, anchors);
    }
  }
  for (const item of routes) {
    const sections = item?.sections;
    if (!Array.isArray(sections) || sections.length > 60) continue;
    const rideIndices = sections.flatMap((section, index) =>
      section?.type === 'move' && section.move !== 'walk' ? [index] : [],
    );
    if (!rideIndices.length) continue;
    const move = item.summary?.move;
    const flags = rideIndices.slice(0, -1).map((index) => sections[index].next_transit);
    const transfers = move?.transit_count ?? flags.filter((flag) => flag === true).length;
    const changes = flags.map((flag) => flag ?? transfers === flags.length);
    if (changes.filter(Boolean).length !== transfers) continue;
    const fare = price(move);
    if (!fare) continue;
    for (const candidate of expected) {
      if (
        rideIndices.length !== candidate.rides.length ||
        transfers !== candidate.transfers ||
        !changes.every((isTransfer, i) => isTransfer === !candidate.rides[i + 1].through) ||
        !rideIndices.every((i, index) =>
          matchesRide(
            sections[i],
            sections[i - 1],
            sections[i + 1],
            candidate.rides[index],
            points,
          ),
        )
      )
        continue;
      const previous = quotes.get(candidate.id);
      if (
        previous === null ||
        (previous && (previous.ic !== fare.ic || previous.ticket !== fare.ticket))
      ) {
        quotes.set(candidate.id, null);
      } else {
        quotes.set(candidate.id, { id: candidate.id, ...fare });
      }
    }
  }
  return [...quotes.values()].filter(Boolean);
}

export function navitimeFareUrl(query) {
  const position = ({ lat, lon }) => `${lat.toFixed(5)},${lon.toFixed(5)}`;
  const url = new URL(`https://${navitimeHost}/route_transit`);
  url.search = new URLSearchParams({
    start: position(query.from.points[0]),
    goal: position(query.to.points[0]),
    start_time: query.time + ':00',
    limit: '10',
    coord_unit: 'degree',
  });
  if (query.conventionalOnly) url.searchParams.set('unuse', 'superexpress_train');
  return url;
}
