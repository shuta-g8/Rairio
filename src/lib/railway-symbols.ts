import type { Station } from '../../shared/stations.ts';

// Route codes and line colours from the operators' route maps.
// These are UI symbols; station numbers are deliberately omitted.
const OPERATORS: Record<string, string> = {
  Toei: '都営地下鉄',
  'JR-East': 'JR線',
  TokyoMetro: '東京メトロ',
  Tokyu: '東急電鉄',
  Keikyu: '京急電鉄',
  Keisei: '京成電鉄',
  Keio: '京王電鉄',
  Odakyu: '小田急電鉄',
  Seibu: '西武鉄道',
  Tobu: '東武鉄道',
  MIR: '首都圏新都市鉄道',
  TokyoMonorail: '東京モノレール',
  Yurikamome: 'ゆりかもめ',
};

export const RAILWAY_SYMBOLS: Record<string, { code: string; color: string }> = {
  'Toei.Asakusa': { code: 'A', color: '#e85298' },
  'Toei.Mita': { code: 'I', color: '#0079c2' },
  'Toei.Shinjuku': { code: 'S', color: '#6cbb5a' },
  'Toei.Oedo': { code: 'E', color: '#b6007a' },
  'Toei.Arakawa': { code: 'SA', color: '#e6007e' },
  'JR-East.Yamanote': { code: 'JY', color: '#80c241' },
  'JR-East.KeihinTohokuNegishi': { code: 'JK', color: '#00b2e5' },
  'JR-East.ChuoRapid': { code: 'JC', color: '#f15a22' },
  'JR-East.ChuoSobuLocal': { code: 'JB', color: '#ffd400' },
  'JR-East.SobuRapid': { code: 'JO', color: '#007ac0' },
  'JR-East.SaikyoKawagoe': { code: 'JA', color: '#00ac9a' },
  'JR-East.ShonanShinjuku': { code: 'JS', color: '#e21f26' },
  'JR-East.Tokaido': { code: 'JT', color: '#f68b1e' },
  'JR-East.Yokosuka': { code: 'JO', color: '#007ac0' },
  'JR-East.JobanRapid': { code: 'JJ', color: '#00b261' },
  // Operator website route-symbol assets, reviewed 2026-11-17.
  'TokyoMetro.Ginza': { code: 'G', color: '#ff9500' },
  'TokyoMetro.Marunouchi': { code: 'M', color: '#f62e36' },
  'TokyoMetro.Hibiya': { code: 'H', color: '#b5b5ac' },
  'TokyoMetro.Tozai': { code: 'T', color: '#009bbf' },
  'TokyoMetro.Chiyoda': { code: 'C', color: '#00bb85' },
  'TokyoMetro.Yurakucho': { code: 'Y', color: '#c1a470' },
  'TokyoMetro.Hanzomon': { code: 'Z', color: '#8f76d6' },
  'TokyoMetro.Namboku': { code: 'N', color: '#00ac9b' },
  'TokyoMetro.Fukutoshin': { code: 'F', color: '#9c5e31' },
  'Tokyu.Ikegami': { code: 'IK', color: '#ee86a7' },
  'Tokyu.Oimachi': { code: 'OM', color: '#f18c43' },
  'Tokyu.Meguro': { code: 'MG', color: '#009cd3' },
  'Tokyu.Toyoko': { code: 'TY', color: '#db0042' },
  'Tokyu.DenEnToshi': { code: 'DT', color: '#00aa8e' },
  'Tokyu.Tamagawa': { code: 'TM', color: '#ae0179' },
  'Tokyu.Setagaya': { code: 'SG', color: '#fcc800' },
  'Tokyu.Kodomonokuni': { code: 'KD', color: '#0071be' },
  'Tokyu.ShinYokohama': { code: 'SH', color: '#6f1585' },
  'Keikyu.Main': { code: 'KK', color: '#e60012' },
  'Keisei.Main': { code: 'KS', color: '#005aaa' },
  'Keisei.Oshiage': { code: 'KS', color: '#005aaa' },
  'Keio.Keio': { code: 'KO', color: '#dd0077' },
  'Keio.KeioNew': { code: 'KO', color: '#dd0077' },
  'Keio.Inokashira': { code: 'IN', color: '#000088' },
  'Odakyu.Odawara': { code: 'OH', color: '#2288cc' },
  'Odakyu.Enoshima': { code: 'OE', color: '#2288cc' },
  'Odakyu.Tama': { code: 'OT', color: '#2288cc' },
  'Seibu.Ikebukuro': { code: 'SI', color: '#ff710a' },
  'Seibu.SeibuYurakucho': { code: 'SI', color: '#ff710a' },
  'Seibu.Shinjuku': { code: 'SS', color: '#00a8b5' },
  'Seibu.Toshima': { code: 'SI', color: '#ff710a' },
  'Seibu.Kokubunji': { code: 'SK', color: '#00a943' },
  'Seibu.Tamako': { code: 'ST', color: '#ffa600' },
  'Seibu.Tamagawa': { code: 'SW', color: '#ff710a' },
  'Seibu.Yamaguchi': { code: 'SY', color: '#ff565d' },
  'Tobu.TobuSkytree': { code: 'TS', color: '#0067c0' },
  'Tobu.Isesaki': { code: 'TI', color: '#e60012' },
  'Tobu.Nikko': { code: 'TN', color: '#f5a200' },
  'Tobu.UrbanPark': { code: 'TD', color: '#00ac9a' },
  'Tobu.Tojo': { code: 'TJ', color: '#004098' },
  'JR-East.Nambu': { code: 'JN', color: '#ffd400' },
  'JR-East.Tsurumi': { code: 'JI', color: '#ffd400' },
  'JR-East.Musashino': { code: 'JM', color: '#f15a22' },
  'JR-East.Yokohama': { code: 'JH', color: '#80c241' },
  'JR-East.Keiyo': { code: 'JE', color: '#c9242f' },
  'JR-East.UtsunomiyaTakasaki': { code: 'JU', color: '#f68b1e' },
  'JR-Central.Gotemba': { code: 'CB', color: '#407cbd' },
  'Toei.NipporiToneri': { code: 'NT', color: '#9dbbcb' },
  'Sotetsu.Sotetsu': { code: 'SO', color: '#041e42' },
  'YokohamaMunicipal.Blue': { code: 'B', color: '#006db0' },
  'YokohamaMunicipal.Green': { code: 'G', color: '#00a040' },
  'Minatomirai.Minatomirai': { code: 'MM', color: '#09357f' },
  'SaitamaRailway.Saitama': { code: 'SR', color: '#345caa' },
  'TWR.Rinkai': { code: 'R', color: '#00418e' },
  'ToyoRapid.ToyoRapid': { code: 'TR', color: '#3fb036' },
  'Hokuso.Hokuso': { code: 'HS', color: '#00a7e3' },
  'ChibaMonorail.Chiba': { code: 'CM', color: '#2843ba' },
  'TamaMonorail.Tama': { code: 'TT', color: '#f58220' },
  'ShonanMonorail.Enoshima': { code: 'SMR', color: '#e60012' },
  'NewShuttle.Ina': { code: 'NS', color: '#339966' },
  'Chichibu.Chichibu': { code: 'CR', color: '#0000ff' },
  'Izuhakone.Daiyuzan': { code: 'ID', color: '#0072bc' },
  'Watarase.Watarase': { code: 'WK', color: '#a52a2a' },
  'Ryutetsu.Nagareyama': { code: 'RN', color: '#ff6600' },
  'MIR.TsukubaExpress': { code: 'TX', color: '#e60012' },
  'TokyoMonorail.HanedaAirport': { code: 'MO', color: '#0079c2' },
  'Yurikamome.Yurikamome': { code: 'U', color: '#00a7db' },
};

// App-wide order inspired by transfer announcements, rather than ODPT ID order.
// Toei announcements can refer to JR collectively, so this is a display convention.
const JR_SYMBOL_ORDER = ['JC', 'JB', 'JY', 'JK', 'JT', 'JO', 'JJ', 'JA', 'JS'];

export function groupStationRailways(
  railways: NonNullable<Station['availableRailways']>,
  selectedRailwayId: string,
) {
  const selectedId = `Toei.${selectedRailwayId}`;
  const ordered = [...railways].sort(
    (a, b) => Number(b.id === selectedId) - Number(a.id === selectedId),
  );
  const groups = new Map<
    string,
    {
      id: string;
      name: string;
      railways: { id: string; railwayIds: string[]; name: string; code: string; color: string }[];
    }
  >();
  for (const railway of ordered) {
    const operatorId = railway.id.split('.')[0];
    const symbol = RAILWAY_SYMBOLS[railway.id];
    if (!symbol || !OPERATORS[operatorId]) throw new Error(`Unknown railway symbol: ${railway.id}`);
    if (!groups.has(operatorId)) {
      groups.set(operatorId, { id: operatorId, name: OPERATORS[operatorId], railways: [] });
    }
    const icons = groups.get(operatorId)!.railways;
    const existing = icons.find((icon) => icon.code === symbol.code && icon.color === symbol.color);
    if (existing) {
      if (!existing.railwayIds.includes(railway.id)) {
        existing.railwayIds.push(railway.id);
        existing.name += `／${railway.name}`;
      }
    } else {
      icons.push({ ...railway, ...symbol, railwayIds: [railway.id] });
    }
  }
  const jr = groups.get('JR-East');
  if (jr) {
    const priority = (code: string) => {
      const index = JR_SYMBOL_ORDER.indexOf(code);
      return index < 0 ? JR_SYMBOL_ORDER.length : index;
    };
    jr.railways.sort((a, b) => priority(a.code) - priority(b.code));
  }
  return [...groups.values()];
}
