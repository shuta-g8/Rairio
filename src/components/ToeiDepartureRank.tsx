import { toeiDisplayLanguage } from '../lib/toei-language';

const TRANSLATIONS = [
  { lang: 'ja', labels: ['せんぱつ', 'じはつ'] },
  { lang: 'en', labels: ['1st', '2nd'] },
  { lang: 'zh-Hans', labels: ['先出发', '后出发'] },
  { lang: 'ko', labels: ['이번 열차', '다음 열차'] },
] as const;

// Checked against photographed Oedo Line LCDs at Kachidoki (May 2019):
// https://ys223.blogspot.com/2019/05/lcd.html
// IMG_1183 (kana), IMG_1184 (English), IMG_1185 (Chinese), IMG_1186 (Korean).
export function ToeiDepartureRank({ index, now }: { index: number; now: Date }) {
  const order = index === 0 ? 0 : 1;
  const translation = TRANSLATIONS.find(({ lang }) => lang === toeiDisplayLanguage(now))!;
  return (
    <>
      <span>{order === 0 ? '先発' : '次発'}</span>
      <span className="toei-rank-translation" lang={translation.lang} aria-hidden="true">
        {translation.labels[order]}
      </span>
    </>
  );
}
