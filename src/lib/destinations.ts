import { STATIONS } from './stations.ts';

// English station names follow the operators' passenger information.
// Source references and the treatment of source-only disambiguators are in README.md.
export const DESTINATIONS_EN: Readonly<Partial<Record<string, string>>> = {
  ...Object.fromEntries(STATIONS.map((station) => [station.name, station.english])),
  新横浜: 'Shin-yokohama',
  日吉: 'Hiyoshi',
  海老名: 'Ebina',
  大和: 'Yamato',
  笹塚: 'Sasazuka',
  橋本: 'Hashimoto',
  若葉台: 'Wakabadai',
  京王多摩センター: 'Keio-tama-center',
  あざみ野: 'Azamino',
  かしわ台: 'Kashiwadai',
  三崎口: 'Misakiguchi',
  三浦海岸: 'Miurakaigan',
  上大岡: 'Kamiooka',
  上永谷: 'Kaminagaya',
  上総一ノ宮: 'Kazusa-Ichinomiya',
  上野: 'Ueno',
  久里浜: 'Kurihama',
  五反田: 'Gotanda',
  京急久里浜: 'Keikyu Kurihama',
  京急川崎: 'Keikyu Kawasaki',
  京成佐倉: 'Keisei Sakura',
  京成成田: 'Keisei Narita',
  京成高砂: 'Keisei Takasago',
  伊東: 'Ito',
  伊豆急下田: 'Izukyu-Shimoda',
  佐倉: 'Sakura',
  保谷: 'Hoya',
  修善寺: 'Shuzenji',
  元住吉: 'Motosumiyoshi',
  '元町・中華街': 'Motomachi-Chukagai',
  光が丘: 'Hikarigaoka',
  八王子: 'Hachioji',
  出雲市: 'Izumoshi',
  前橋: 'Maebashi',
  勝田: 'Katsuta',
  千葉: 'Chiba',
  南浦和: 'Minami-Urawa',
  印旛日本医大: 'Imba nihon-idai',
  印西牧の原: 'Inzai-Makinohara',
  取手: 'Toride',
  古河: 'Koga',
  吉川美南: 'Yoshikawaminami',
  君津: 'Kimitsu',
  和光市: 'Wakoshi',
  品川: 'Shinagawa',
  国府津: 'Kozu',
  土浦: 'Tsuchiura',
  多摩川: 'Tamagawa',
  '大和(神奈川県)': 'Yamato',
  '大宮(埼玉県)': 'Omiya',
  大崎: 'Osaki',
  大船: 'Ofuna',
  宇都宮: 'Utsunomiya',
  宗吾参道: 'Sogosando',
  '小川町(埼玉県)': 'Ogawamachi',
  小手指: 'Kotesashi',
  小田原: 'Odawara',
  小金井: 'Koganei',
  川越市: 'Kawagoeshi',
  平塚: 'Hiratsuka',
  志木: 'Shiki',
  成東: 'Naruto',
  成田: 'Narita',
  '成田空港(鉄道)': 'Narita Airport Terminal 1',
  所沢: 'Tokorozawa',
  押上: 'Oshiage',
  新前橋: 'Shin-Maebashi',
  新宿三丁目: 'Shinjuku-sanchome',
  新御徒町: 'Shin-okachimachi',
  新宿: 'Shinjuku',
  新羽: 'Nippa',
  '日吉(神奈川県)': 'Hiyoshi',
  日立: 'Hitachi',
  '有明(東京都)': 'Ariake',
  東京: 'Tokyo',
  東神奈川: 'Higashi-Kanagawa',
  桜木町: 'Sakuragicho',
  '森林公園(埼玉県)': 'Shinrin-koen',
  横須賀: 'Yokosuka',
  '橋本(神奈川県)': 'Hashimoto',
  武蔵中原: 'Musashi-Nakahara',
  武蔵小杉: 'Musashi-kosugi',
  武蔵溝ノ口: 'Musashi-Mizonokuchi',
  水戸: 'Mito',
  汐留: 'Shiodome',
  池袋: 'Ikebukuro',
  沼津: 'Numazu',
  泉岳寺: 'Sengakuji',
  津田沼: 'Tsudanuma',
  浅草: 'Asakusa',
  浦賀: 'Uraga',
  '海老名(相鉄・小田急)': 'Ebina',
  清澄白河: 'Kiyosumi-shirakawa',
  清瀬: 'Kiyose',
  渋谷: 'Shibuya',
  湘南台: 'Shonandai',
  熱海: 'Atami',
  琴平: 'Kotohira',
  環状運転: 'Loop service',
  登戸: 'Noborito',
  石神井公園: 'Shakujii-koen',
  磯子: 'Isogo',
  神奈川新町: 'Kanagawa-shimmachi',
  稲城長沼: 'Inagi-Naganuma',
  立川: 'Tachikawa',
  籠原: 'Kagohara',
  '羽田空港第１・第２ターミナル(京急)': 'Haneda Airport Terminal 1・2',
  自由が丘: 'Jiyugaoka',
  芝山千代田: 'Shibayama Chiyoda',
  菊名: 'Kikuna',
  蒲田: 'Kamata',
  西武秩父: 'Seibu-Chichibu',
  西谷: 'Nishiya',
  西馬込: 'Nishi-magome',
  豊洲: 'Toyosu',
  赤羽: 'Akabane',
  踊場: 'Odoriba',
  逗子: 'Zushi',
  '逗子・葉山': 'Zushi-Hayama',
  都庁前: 'Tochomae',
  金沢文庫: 'Kanazawa-bunko',
  鎌倉: 'Kamakura',
  雪が谷大塚: 'Yukigaya-otsuka',
  青砥: 'Aoto',
  飯能: 'Hanno',
  高崎: 'Takasaki',
  '高松(香川県)': 'Takamatsu',
  高萩: 'Takahagi',
  鶴見: 'Tsurumi',
  鹿島神宮: 'Kashimajingu',
};

interface DestinationPresentation {
  name: string;
  suffix: string;
  english: string | undefined;
  englishPrefix: string;
}

function englishDestination(destination: string): string | undefined {
  return Object.hasOwn(DESTINATIONS_EN, destination) ? DESTINATIONS_EN[destination] : undefined;
}

export function destinationPresentation(
  destination: string,
  yamanoteDirection?: string,
): DestinationPresentation {
  const isYamanote = yamanoteDirection !== undefined;
  if (isYamanote && destination === '環状運転') {
    const stations = yamanoteDirection.split('・').map(englishDestination);
    return {
      name: `山手線　${yamanoteDirection}`,
      suffix: '方面',
      english: stations.every((station) => station !== undefined)
        ? `Yamanote Line　For ${stations.join(' / ')}`
        : undefined,
      englishPrefix: '',
    };
  }
  return {
    // Source disambiguators and station secondary names belong to the catalog,
    // not the departure destination. Keep the original key for English lookup.
    name: destination.replace(/\([^()]*\)|（[^（）]*）|\[[^\[\]]*\]|［[^［］]*］/g, '').trim(),
    suffix: isYamanote ? '行' : ' 行き',
    english: englishDestination(destination),
    englishPrefix: destination === '環状運転' ? '' : 'For ',
  };
}

export function englishPlatform(platform: string): string {
  const normalized = platform.normalize('NFKC');
  const underground = normalized.startsWith('地下');
  const numbers = normalized.replace(/^地下/, '').split('・').join(' / ');
  const label = normalized.includes('・') ? 'Platforms' : 'Platform';
  return underground ? `Underground ${label.toLowerCase()} ${numbers}` : `${label} ${numbers}`;
}
