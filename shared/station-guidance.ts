// Official sources are listed in public/metadata/station-guidance-sources.json.
export const STATION_GUIDANCE_CHECKED_AT = '2026-11-01';
export const STATION_SUBNAME_SOURCE =
  'https://www.kotsu.metro.tokyo.jp/enq/customer/pdf/customer-december_r03.pdf';

export const STATION_SUBNAMES: Record<string, { name: string; aliases: string[] }> = {
  daimon: { name: '浜松町', aliases: ['はままつちょう', 'Hamamatsucho'] },
  oshiage: {
    name: 'スカイツリー前',
    aliases: ['すかいつりーまえ', 'スカイツリー', 'Tokyo Skytree'],
  },
  kasuga: {
    name: '文京シビックセンター前',
    aliases: ['ぶんきょうしびっくせんたーまえ', 'Bunkyo Civic Center'],
  },
  iwamotocho: { name: '秋葉原', aliases: ['あきはばら', 'Akihabara'] },
  ryogoku: {
    name: '江戸東京博物館前',
    aliases: ['えどとうきょうはくぶつかんまえ', 'Edo Tokyo Museum'],
  },
  shiodome: { name: 'シオサイト', aliases: ['しおさいと', 'Sio Site'] },
  kokuritsukyogijo: {
    name: '東京体育館前',
    aliases: ['とうきょうたいいくかんまえ', 'Tokyo Metropolitan Gymnasium'],
  },
  nishishinjukugochome: { name: '清水橋', aliases: ['しみずばし', 'Shimizubashi'] },
};

// ODPT railway identifiers are retained independently of passenger-facing names.
export const GUIDANCE_RAILWAY_NAMES: Record<string, string> = {
  'Toei.Asakusa': '都営浅草線',
  'Toei.Mita': '都営三田線',
  'Toei.Shinjuku': '都営新宿線',
  'Toei.Oedo': '都営大江戸線',
  'Toei.Arakawa': '東京さくらトラム（都電荒川線）',
  'JR-East.Yamanote': 'JR山手線',
  'JR-East.KeihinTohokuNegishi': 'JR京浜東北線',
  'JR-East.ChuoRapid': 'JR中央線快速',
  'JR-East.ChuoSobuLocal': 'JR中央・総武線各駅停車',
  'JR-East.SobuRapid': 'JR総武線快速',
  'JR-East.SaikyoKawagoe': 'JR埼京線',
  'JR-East.ShonanShinjuku': 'JR湘南新宿ライン',
  'JR-East.Tokaido': 'JR東海道線',
  'JR-East.Yokosuka': 'JR横須賀線',
  'JR-East.JobanRapid': 'JR常磐線（上野東京ライン）',
  'TokyoMetro.Ginza': '東京メトロ銀座線',
  'TokyoMetro.Marunouchi': '東京メトロ丸ノ内線',
  'TokyoMetro.Hibiya': '東京メトロ日比谷線',
  'TokyoMetro.Tozai': '東京メトロ東西線',
  'TokyoMetro.Chiyoda': '東京メトロ千代田線',
  'TokyoMetro.Yurakucho': '東京メトロ有楽町線',
  'TokyoMetro.Hanzomon': '東京メトロ半蔵門線',
  'TokyoMetro.Namboku': '東京メトロ南北線',
  'TokyoMetro.Fukutoshin': '東京メトロ副都心線',
  'Tokyu.Ikegami': '東急池上線',
  'Tokyu.Oimachi': '東急大井町線',
  'Tokyu.Meguro': '東急目黒線',
  'Keikyu.Main': '京急本線',
  'Keisei.Main': '京成本線',
  'Keisei.Oshiage': '京成押上線',
  'Keio.Keio': '京王線',
  'Keio.KeioNew': '京王新線',
  'Odakyu.Odawara': '小田急小田原線',
  'Seibu.Ikebukuro': '西武池袋線',
  'Seibu.SeibuYurakucho': '西武有楽町線',
  'Seibu.Shinjuku': '西武新宿線',
  'Seibu.Toshima': '西武豊島線',
  'Tobu.TobuSkytree': '東武スカイツリーライン',
  'MIR.TsukubaExpress': 'つくばエクスプレス',
  'TokyoMonorail.HanedaAirport': '東京モノレール',
  'Yurikamome.Yurikamome': 'ゆりかもめ',
};

export const GUIDANCE_RAILWAY_GROUPS: Record<string, string> = {
  'TokyoMetro.MarunouchiBranch': 'TokyoMetro.Marunouchi',
  'Tobu.TobuSkytreeBranch': 'Tobu.TobuSkytree',
};

export const ADDITIONAL_STATION_RAILWAYS: Record<string, { id: string; source: string }[]> = {
  shinjuku: [
    {
      id: 'TokyoMetro.Marunouchi',
      source: 'https://www.tokyometro.jp/station/shinjuku/index.html',
    },
  ],
  toshimaen: [
    { id: 'Seibu.Toshima', source: 'https://www.seiburailway.jp/railway/station/toshimaen/' },
  ],
};
