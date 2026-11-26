import { RAILWAY_SYMBOLS } from './railway-symbols.ts';

// The LCD uses cyan for Keikyu (including its KK badge), rather than the red
// used on Keikyu's own route maps. Approximate from photographed Toei displays:
// https://r113.sakura.ne.jp/p/hasshahyo/toei-lcd-2019/index.html
export function toeiMapColor(railwayId: string): string {
  return railwayId === 'Keikyu.Main' ? '#00b8e4' : RAILWAY_SYMBOLS[railwayId].color;
}

// Passenger-facing labels for the existing transfer IDs. Station names remain
// sourced from the station catalog; these labels do not add routes or stops.
export const TOEI_TRANSFER_NAMES_EN: Readonly<Record<string, string>> = {
  'Toei.Asakusa': 'Asakusa Line',
  'Toei.Mita': 'Mita Line',
  'Toei.Shinjuku': 'Shinjuku Line',
  'Toei.Oedo': 'Oedo Line',
  'Toei.Arakawa': 'Tokyo Sakura Tram',
  'TokyoMetro.Ginza': 'Ginza Line',
  'TokyoMetro.Marunouchi': 'Marunouchi Line',
  'TokyoMetro.Hibiya': 'Hibiya Line',
  'TokyoMetro.Tozai': 'Tozai Line',
  'TokyoMetro.Chiyoda': 'Chiyoda Line',
  'TokyoMetro.Yurakucho': 'Yurakucho Line',
  'TokyoMetro.Hanzomon': 'Hanzomon Line',
  'TokyoMetro.Namboku': 'Namboku Line',
  'TokyoMetro.Fukutoshin': 'Fukutoshin Line',
  'JR-East.Yamanote': 'JR Yamanote Line',
  'JR-East.KeihinTohokuNegishi': 'JR Keihin-Tohoku Line',
  'JR-East.ChuoRapid': 'JR Chuo Line',
  'JR-East.ChuoSobuLocal': 'JR Chuo/Sobu Line',
  'JR-East.SobuRapid': 'JR Sobu Line',
  'JR-East.SaikyoKawagoe': 'JR Saikyo Line',
  'JR-East.ShonanShinjuku': 'JR Shonan-Shinjuku Line',
  'JR-East.Tokaido': 'JR Tokaido Line',
  'JR-East.Yokosuka': 'JR Yokosuka Line',
  'JR-East.JobanRapid': 'JR Joban Line',
  'Tokyu.Ikegami': 'Tokyu Ikegami Line',
  'Tokyu.Oimachi': 'Tokyu Oimachi Line',
  'Tokyu.Meguro': 'Tokyu Meguro Line',
  'Keikyu.Main': 'Keikyu Line',
  'Keisei.Main': 'Keisei Line',
  'Keisei.Oshiage': 'Keisei Oshiage Line',
  'Keio.Keio': 'Keio Line',
  'Keio.KeioNew': 'Keio New Line',
  'Odakyu.Odawara': 'Odakyu Line',
  'Seibu.Ikebukuro': 'Seibu Ikebukuro Line',
  'Seibu.SeibuYurakucho': 'Seibu Yurakucho Line',
  'Seibu.Shinjuku': 'Seibu Shinjuku Line',
  'Seibu.Toshima': 'Seibu Toshima Line',
  'Tobu.TobuSkytree': 'Tobu Skytree Line',
  'MIR.TsukubaExpress': 'Tsukuba Express',
  'TokyoMonorail.HanedaAirport': 'Tokyo Monorail',
  'Yurikamome.Yurikamome': 'Yurikamome',
};

export interface ToeiContinuation {
  id: string;
  name: string;
  lineColor: string;
  // Network destinations, not a claim that the selected train serves each branch.
  details: readonly { ja: string; en: string }[];
}

export const TOEI_CONTINUATIONS: Readonly<Record<string, ToeiContinuation>> = {
  'Asakusa.Northbound': {
    id: 'Keisei.Oshiage',
    name: '京成線',
    lineColor: '#005eff',
    details: [
      { ja: '成田スカイアクセス線 成田空港方面', en: 'Narita SKY ACCESS Line / Narita Airport' },
      { ja: '北総線 印旛日本医大方面', en: 'Hokuso Line / Imba nihon-idai' },
      { ja: '芝山鉄道線 芝山千代田方面', en: 'Shibayama Railway / Shibayama Chiyoda' },
    ],
  },
  'Asakusa.Southbound': {
    id: 'Keikyu.Main',
    name: '京急線',
    // Asakusa platform 1 LCD, cyan beyond Sengakuji at 5:40.
    // https://www.youtube.com/watch?v=P0LMD8rYaaY&t=340s
    lineColor: toeiMapColor('Keikyu.Main'),
    details: [
      { ja: '空港線 羽田空港方面', en: 'Airport Line / Haneda Airport' },
      { ja: '本線・久里浜線 三崎口方面', en: 'Main / Kurihama Line / Misakiguchi' },
      { ja: '逗子線 逗子・葉山方面', en: 'Zushi Line / Zushi-Hayama' },
    ],
  },
  'Mita.Southbound': {
    id: 'Tokyu.Meguro',
    name: '東急目黒線',
    lineColor: '#0088ff',
    details: [
      { ja: '目黒線 日吉方面', en: 'Meguro Line / Hiyoshi' },
      { ja: '東急新横浜線 新横浜方面', en: 'Tokyu Shin-yokohama Line / Shin-yokohama' },
      { ja: '相鉄線 海老名・湘南台方面', en: 'Sotetsu Line / Ebina / Shonandai' },
    ],
  },
  'Shinjuku.Westbound': {
    id: 'Keio.KeioNew',
    name: '京王線',
    lineColor: '#ff317c',
    details: [
      { ja: '京王新線 笹塚方面', en: 'Keio New Line / Sasazuka' },
      {
        ja: '相模原線 京王多摩センター・橋本方面',
        en: 'Sagamihara Line / Keio-tama-center / Hashimoto',
      },
    ],
  },
};
