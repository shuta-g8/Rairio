import { RAILWAY_SYMBOLS } from './railway-symbols.ts';

export interface NetworkLineReview {
  railwayId?: string;
  source: string;
  note?: string;
}

// Explicit IDs prevent similar line names and old operator names from selecting the wrong icon.
// Route symbols are UI renderings, not copies of operator logos. Sources reviewed 2026-11-17.
export const NETWORK_LINE_REVIEWS: Record<string, NetworkLineReview> = {};
function register(source: string, groups: Record<string, string[]>) {
  for (const [railwayId, ids] of Object.entries(groups))
    for (const id of ids) NETWORK_LINE_REVIEWS[id] = { railwayId, source };
}
function generic(source: string, ids: string[], note: string) {
  for (const id of ids) NETWORK_LINE_REVIEWS[id] = { source, note };
}

const jr = 'https://www.jreast.co.jp/map/pdf/map_tokyo.pdf';
register(jr, {
  'JR-East.Tokaido': ['11301'],
  'JR-East.Yamanote': ['11302'],
  'JR-East.Nambu': ['11303'],
  'JR-East.Tsurumi': ['11304'],
  'JR-East.Musashino': ['11305'],
  'JR-East.Yokohama': ['11306'],
  'JR-East.KeihinTohokuNegishi': ['11307', '11332'],
  'JR-East.Yokosuka': ['11308'],
  'JR-East.ChuoRapid': ['11312', '11315', '11316'],
  'JR-East.ChuoSobuLocal': ['11313'],
  'JR-East.UtsunomiyaTakasaki': ['11319', '11323'],
  'JR-East.JobanRapid': ['11320'],
  'JR-East.SaikyoKawagoe': ['11321'],
  'JR-East.Keiyo': ['11326'],
  'JR-East.ShonanShinjuku': ['11333'],
});
generic(
  jr,
  [
    '11231',
    '11229',
    '11309',
    '11311',
    '11314',
    '11317',
    '11318',
    '11322',
    '11324',
    '11325',
    '11327',
    '11328',
    '11329',
    '11330',
    '11331',
    '11343',
    '11334',
    '11335',
    '11337',
    '11338',
    '11339',
    '11340',
    '11341',
    '11342',
  ],
  '全区間に適用できる単一の路線記号を確認できないため、電車ピクトグラムを表示。',
);
register('https://railway.jr-central.co.jp/route-map/', { 'JR-Central.Gotemba': ['11505'] });

register('https://www.tobu.co.jp/pdf/guide/tobuStation.pdf', {
  'Tobu.Tojo': ['21001', '21007'],
  'Tobu.Nikko': ['21003', '21008', '21009'],
  'Tobu.UrbanPark': ['21004'],
  'Tobu.TobuSkytree': ['21005', '21006'],
  'Tobu.Isesaki': ['21010', '21011', '21012'],
});
generic(
  'https://www.tobu.co.jp/pdf/guide/tobuStation.pdf',
  ['21002'],
  'スカイツリーラインのTSと伊勢崎線のTIを含むため、全線をTSと断定しない。',
);
register('https://www.seiburailway.jp/railway/station/', {
  'Seibu.Ikebukuro': ['22001', '22002', '22003', '22004', '22005'],
  'Seibu.Yamaguchi': ['22006'],
  'Seibu.Shinjuku': ['22007', '22008'],
  'Seibu.Kokubunji': ['22009', '22010'],
  'Seibu.Tamako': ['22011'],
  'Seibu.Tamagawa': ['22012'],
});
register('https://www.keisei.co.jp/keisei/tetudou/accessj/rosen.php', {
  'Keisei.Main': ['23001', '23003', '23004', '23005', '23006', '99329'],
  'Keisei.Oshiage': ['23002'],
});
register('https://www.keio.co.jp/train/station/', {
  'Keio.Keio': ['24001', '24002', '24003', '24004', '24005'],
  'Keio.KeioNew': ['24007'],
  'Keio.Inokashira': ['24006'],
});
register('https://www.odakyu.jp/station/', {
  'Odakyu.Odawara': ['25001'],
  'Odakyu.Enoshima': ['25002'],
  'Odakyu.Tama': ['25003'],
});
register('https://www.tokyu.co.jp/railway/map/', {
  'Tokyu.Toyoko': ['26001'],
  'Tokyu.Meguro': ['26002'],
  'Tokyu.DenEnToshi': ['26003'],
  'Tokyu.Oimachi': ['26004'],
  'Tokyu.Ikegami': ['26005'],
  'Tokyu.Tamagawa': ['26006'],
  'Tokyu.Setagaya': ['26007'],
  'Tokyu.Kodomonokuni': ['26008'],
  'Tokyu.ShinYokohama': ['26009'],
});
register('https://www.keikyu.co.jp/ride/kakueki/', {
  'Keikyu.Main': ['27001', '27002', '27003', '27004', '27005'],
});
register('https://www.tokyometro.jp/station/index.html', {
  'TokyoMetro.Ginza': ['28001'],
  'TokyoMetro.Marunouchi': ['28002'],
  'TokyoMetro.Hibiya': ['28003'],
  'TokyoMetro.Tozai': ['28004'],
  'TokyoMetro.Chiyoda': ['28005'],
  'TokyoMetro.Yurakucho': ['28006'],
  'TokyoMetro.Hanzomon': ['28008'],
  'TokyoMetro.Namboku': ['28009'],
  'TokyoMetro.Fukutoshin': ['28010'],
});
register('https://www.sotetsu.co.jp/train/stations/', {
  'Sotetsu.Sotetsu': ['29001', '29002', '29003', '29004'],
});
register('https://www.kotsu.metro.tokyo.jp/toei-guide/guide2026.pdf', {
  'Toei.Oedo': ['99301'],
  'Toei.Asakusa': ['99302'],
  'Toei.Mita': ['99303'],
  'Toei.Shinjuku': ['99304'],
  'Toei.Arakawa': ['99305'],
  'Toei.NipporiToneri': ['99342'],
});
register('https://www.chichibu-railway.co.jp/blog/news/20220913-3/', {
  'Chichibu.Chichibu': ['99306'],
});
register('https://www.s-rail.co.jp/news/up_pdf/pr20161128-sta-numbering.pdf', {
  'SaitamaRailway.Saitama': ['99307'],
});
register('https://www.mir.co.jp/route_map/', { 'MIR.TsukubaExpress': ['99309'] });
register('https://www.mm21railway.co.jp/info/route_map.html', {
  'Minatomirai.Minatomirai': ['99310'],
});
register('https://www.yurikamome.co.jp/ride/route/', { 'Yurikamome.Yurikamome': ['99311'] });
register('https://www.watetsu.com/rail-info/', { 'Watarase.Watarase': ['99312'] });
register('https://www.izuhakone.co.jp/sunzudaiyu/', { 'Izuhakone.Daiyuzan': ['99314'] });
register('https://www.city.yokohama.lg.jp/kotsu/sub/', {
  'YokohamaMunicipal.Blue': ['99316'],
  'YokohamaMunicipal.Green': ['99343'],
});
register('https://www.new-shuttle.jp/station/', { 'NewShuttle.Ina': ['99321'] });
register('https://www.shonan-monorail.co.jp/station/', { 'ShonanMonorail.Enoshima': ['99326'] });
register('https://chiba-monorail.co.jp/index.php/20190218nanbering/', {
  'ChibaMonorail.Chiba': ['99331', '99332'],
});
register('https://www.ryutetsu.jp/station/', { 'Ryutetsu.Nagareyama': ['99333'] });
register('https://www.tama-monorail.co.jp/info/list/mt_img/290630_press_Station_code.pdf', {
  'TamaMonorail.Tama': ['99334'],
});
register('https://www.tokyo-monorail.co.jp/guide/numbering/', {
  'TokyoMonorail.HanedaAirport': ['99336'],
});
register('https://www.twr.co.jp/Default.aspx?TabId=101&dispmid=860&itemid=218', {
  'TWR.Rinkai': ['99337'],
});
register('https://www.toyokosoku.co.jp/wp/images/putitori_vol.40sai.pdf', {
  'ToyoRapid.ToyoRapid': ['99338'],
});
register('https://www.hakonenavi.jp/transportation/', { 'Odakyu.Odawara': ['99339', '99344'] });
register('https://www.hokuso-railway.co.jp/railway/', { 'Hokuso.Hokuso': ['99340'] });

// A numeric station number is not an alphabetic line code. Never manufacture one from a name.
const otherSources: Record<string, string> = {
  '11344': 'https://www.tokyodisneyresort.jp/drl/',
  '99308': 'https://isumirail.co.jp/',
  '99313': 'https://www.yamaman.co.jp/yukarigaoka/yukariline/',
  '99315': 'https://www.hitachinaka-rail.co.jp/',
  '99317': 'https://www.seasideline.co.jp/',
  '99318': 'https://www.kantetsu.co.jp/',
  '99319': 'https://www.kantetsu.co.jp/',
  '99320': 'https://www.enoden.co.jp/train/station/',
  '99323': 'https://www.rintetsu.co.jp/',
  '99324': 'https://www.sibatetu.co.jp/',
  '99325': 'https://www.kominato.co.jp/',
  '99327': 'https://www.joshin-dentetsu.co.jp/',
  '99328': 'https://jomorailway.com/',
  '99330': 'https://www.moka-railway.co.jp/',
  '99335': 'https://www.choshi-dentetsu.jp/',
  '99341': 'https://www.yagan.co.jp/',
  '99345': 'https://www.miyarail.co.jp/',
};
for (const [id, source] of Object.entries(otherSources))
  generic(
    source,
    [id],
    '路線全体に対応する英字記号を今回の公式資料で確認できていないため、電車ピクトグラムを表示。',
  );

export const GENERIC_RAIL_SYMBOL = { code: '', color: '#687582' };
export function reviewedNetworkLineSymbol(id: string) {
  const review = NETWORK_LINE_REVIEWS[id];
  return review?.railwayId ? RAILWAY_SYMBOLS[review.railwayId] : GENERIC_RAIL_SYMBOL;
}
