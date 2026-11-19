const LANGUAGES = ['ja', 'en', 'zh-Hans', 'ko'] as const;
export type ToeiDisplayLanguage = (typeof LANGUAGES)[number];

export function toeiDisplayLanguage(now: Date) {
  return LANGUAGES[Math.floor(now.getTime() / 5000) % LANGUAGES.length];
}

// Direction anchors on the four Toei lines and Oedo short-turn destinations.
// Chinese uses simplified characters; Korean uses station-name transliterations.
const STATION_NAMES: Readonly<Record<string, readonly [string, string]>> = {
  大門: ['大门', '다이몬'],
  両国: ['两国', '료고쿠'],
  六本木: ['六本木', '롯폰기'],
  新宿: ['新宿', '신주쿠'],
  都庁前: ['都厅前', '도초마에'],
  春日: ['春日', '가스가'],
  練馬: ['练马', '네리마'],
  光が丘: ['光丘', '히카리가오카'],
  清澄白河: ['清澄白河', '기요스미시라카와'],
  新御徒町: ['新御徒町', '신오카치마치'],
  汐留: ['汐留', '시오도메'],
  押上: ['押上', '오시아게'],
  西馬込: ['西马込', '니시마고메'],
  西高島平: ['西高岛平', '니시타카시마다이라'],
  目黒: ['目黑', '메구로'],
  本八幡: ['本八幡', '모토야와타'],
  // Keikyu's multilingual airport access guides (guidebook_cn.pdf / guidebook_kr.pdf).
  '羽田空港第１・第２ターミナル': ['羽田机场第1・第2航站楼', '하네다공항 제1·제2터미널'],
};

export function toeiStationName(name: string, language: 'zh-Hans' | 'ko') {
  return STATION_NAMES[name]?.[language === 'zh-Hans' ? 0 : 1];
}
