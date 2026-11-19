import type { toeiDisplayLanguage } from './toei-language';
import { spacedTrainTypeName, trainTypeName, isToeiLocalType } from './train-type.ts';

export { trainTypeColor as toeiTrainTypeColor } from './train-type.ts';

// Labels are abbreviated for the sign. Access Exp. and the airplane + Limited
// Exp. combination follow the supplied LCD references, rather than ODPT titles.
// Keep these distinct: Rapid / Express / Limited Express / Rapid Limited Express.
export const TOEI_TRAIN_TYPES: Readonly<
  Record<string, Record<ReturnType<typeof toeiDisplayLanguage>, string>>
> = {
  普通: { ja: 'ふつう', en: 'Local', 'zh-Hans': '普通', ko: '보통' },
  各駅停車: { ja: 'かくえきていしゃ', en: 'Local', 'zh-Hans': '各站停车', ko: '각역정차' },
  快速: { ja: 'かいそく', en: 'Rapid', 'zh-Hans': '快速', ko: '쾌속' },
  急行: { ja: 'きゅうこう', en: 'Express', 'zh-Hans': '急行', ko: '급행' },
  特急: { ja: 'とっきゅう', en: 'Limited Exp.', 'zh-Hans': '特快', ko: '특급' },
  快特: { ja: 'かいとく', en: 'Rapid Ltd. Exp.', 'zh-Hans': '快特', ko: '쾌특' },
  通勤特急: {
    ja: 'つうとく',
    en: 'Commuter Ltd. Exp.',
    'zh-Hans': '通勤特快',
    ko: '통근특급',
  },
  アクセス特急: {
    ja: 'あくせすとっきゅう',
    en: 'Access Exp.',
    'zh-Hans': 'Access特快',
    ko: '액세스특급',
  },
  エアポート快特: {
    ja: 'えあぽーとかいとく',
    en: 'Limited Exp.',
    'zh-Hans': '机场快特',
    ko: '공항쾌특',
  },
};

const LCD_TYPE_NAMES: Readonly<Partial<Record<string, string>>> = {
  アクセス特急: '特急',
  エアポート快特: '快特',
  通勤特急: '通特',
};

/** The next-train badge uses compact names and split side labels. */
export function toeiTrainTypeDisplay(
  type: string,
  railwayId: string | undefined,
  language: ReturnType<typeof toeiDisplayLanguage>,
  secondary: boolean,
) {
  const local = isToeiLocalType(type, railwayId);
  const canonical = trainTypeName(type, railwayId);
  const prefix = type === 'アクセス特急' ? 'アクセス' : '';
  const airplane = type === 'エアポート快特';
  const name = local ? '各停' : (LCD_TYPE_NAMES[canonical] ?? canonical);
  const label = local
    ? { ja: 'かくてい', en: 'Local', 'zh-Hans': '每站停车', ko: '각역정차' }[language]
    : TOEI_TRAIN_TYPES[canonical]?.[language];
  let translation = label ? [label] : [];
  if (secondary && label) {
    if (language === 'ja') {
      if (type === 'アクセス特急') translation = ['あくせす', 'とっきゅう'];
      else if (airplane) translation = ['えあぽーと', 'かいとく'];
    } else if (language === 'en' && label.endsWith(' Exp.')) {
      translation = [label.slice(0, -5), 'Exp.'];
    }
  }
  return { name: secondary ? name : spacedTrainTypeName(name), prefix, airplane, translation };
}
