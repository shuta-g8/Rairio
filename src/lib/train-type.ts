// Badges abbreviate display names; accessible labels and timetables use full names.
export const TRAIN_TYPE_LABELS: Readonly<Partial<Record<string, string>>> = {
  普通: '普通',
  各駅停車: '各停',
  快速: '快速',
  快特: '快特',
  急行: '急行',
  特急: '特急',
  特別快速: '特快',
  通勤特急: '通特',
  アクセス特急: 'ア特',
  エアポート快特: 'エ快',
  京急ウイング: 'Ｗ号',
  寝台特急: '寝特',
  'Ｓ−ＴＲＡＩＮ': 'ＳＴ',
};

/** Presentation only: leave source types intact for train matching. */
export function isToeiLocalType(type: string, railwayId = ''): boolean {
  return ['普通', '各駅停車', '各停'].includes(type) && ['Mita', 'Shinjuku'].includes(railwayId);
}
export function trainTypeName(type: string, railwayId = ''): string {
  if (isToeiLocalType(type, railwayId) || type === '各停') return '各駅停車';
  return type === '快速特急' ? '快特' : type;
}
export function trainTypeLabel(type: string, _secondary = false, railwayId = ''): string {
  type = trainTypeName(type, railwayId);
  const label = Object.hasOwn(TRAIN_TYPE_LABELS, type) ? TRAIN_TYPE_LABELS[type]! : type;
  return label;
}

/** Display spacing only: timetable/service keys and accessible labels stay intact. */
export function spacedTrainTypeName(name: string): string {
  return name.replace(/^(\p{Script=Han})(\p{Script=Han})$/u, '$1 $2');
}

// Color categories follow the Keisei/Keikyu official stop guide and photographed
// Toei LCDs. RGB values approximate the display; they are not manufacturer specs.
// https://www.keisei.co.jp/keisei/tetudou/railmap/railmap.pdf
// https://r113.sakura.ne.jp/p/hasshahyo/toei-lcd-2019/index.html
export function trainTypeColor(type: string, railwayId = '') {
  if (type === '普通' || type === '各駅停車' || type === '各停') {
    // Blue local-service panel in the supplied Mita LCD reference.
    if (railwayId === 'Mita') return '#006bb9';
    if (railwayId === 'Shinjuku') return '#8b9e25';
    return 'transparent';
  }
  switch (type) {
    case 'アクセス特急':
      return '#ff7d1a';
    case 'エアポート快特':
      return '#ff9800';
    case '快特':
    case '快速特急':
      return '#009442';
    case '特急':
      return railwayId === 'Asakusa' ? '#ff0000' : '#d32729';
    case '通勤特急':
      return '#38a9dd';
    case '快速':
      return '#de5089';
    case '急行':
      return railwayId === 'Asakusa' ? '#005cc5' : '#d32729';
    default:
      return 'transparent';
  }
}
