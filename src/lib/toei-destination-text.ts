import type { toeiBoardDestination } from './toei-board';
import { toeiStationName, type ToeiDisplayLanguage } from './toei-language.ts';

type Destination = ReturnType<typeof toeiBoardDestination>;
interface TranslationLine {
  text: string;
  suffix?: string;
}
export interface ToeiDestinationTranslation {
  language: ToeiDisplayLanguage;
  lines: TranslationLine[];
}

const AIRPORT_NAME = '羽田空港第１・第２ターミナル';
const AIRPORT_LINES = {
  en: ['For Haneda Airport ', 'Terminal 1・2'],
  'zh-Hans': ['开往羽田机场', '第1・第2航站楼'],
  ko: ['하네다공항 ', '제1·제2터미널행'],
};

export function toeiDestinationNameLines(name: string): readonly string[] {
  return name === AIRPORT_NAME ? ['羽田空港', '第１・第２ターミナル'] : [name];
}

/** Select one complete language before adding its direction or via wording. */
export function toeiDestinationTranslation(
  { stations, via, terminal }: Destination,
  requested: ToeiDisplayLanguage,
): ToeiDestinationTranslation | undefined {
  const hasReading = stations.every((station) => station.reading);
  const hasEnglish = stations.every((station) => station.english);
  if (!hasReading && !hasEnglish) return;
  let language = requested;
  if (
    (requested === 'zh-Hans' || requested === 'ko') &&
    !stations.every((station) => toeiStationName(station.name, requested))
  )
    language = hasEnglish ? 'en' : 'ja';
  if (language === 'ja' && !hasReading) language = 'en';
  // Match the two-line airport name in every language.
  if (terminal && stations.length === 1 && stations[0].name === AIRPORT_NAME)
    return {
      language,
      lines:
        language === 'ja'
          ? [{ text: 'はねだくうこう' }, { text: 'だい1・だい2ターミナル', suffix: 'ゆき' }]
          : AIRPORT_LINES[language].map((text) => ({ text })),
    };
  if (language === 'ja')
    return {
      language,
      lines: stations.map((station, index) => ({
        text: `${station.reading}${!via && !terminal && index === stations.length - 1 ? 'ほうめん' : ''}`,
        suffix: via && index === 0 ? 'けいゆ' : index === stations.length - 1 ? 'ゆき' : undefined,
      })),
    };
  if (language === 'en') {
    if (!hasEnglish) return;
    return {
      language,
      lines: (via
        ? [`For ${stations[1].english}`, `via ${stations[0].english}`]
        : [`For ${stations.map((station) => station.english).join(', ')}`]
      ).map((text) => ({ text })),
    };
  }
  const names = stations.map((station) => toeiStationName(station.name, language)!);
  const lines =
    language === 'zh-Hans'
      ? via
        ? [`开往${names[1]}`, `经由${names[0]}`]
        : [terminal ? `开往${names[0]}` : `${names.join('、')}方向`]
      : via
        ? [`${names[0]} 경유`, `${names[1]}행`]
        : [terminal ? `${names[0]}행` : `${names.join('·')} 방면`];
  return { language, lines: lines.map((text) => ({ text })) };
}
