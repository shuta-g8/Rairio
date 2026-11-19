import type { LineOperation } from '../../shared/railways';

export type ToeiGuidanceTone = 'red' | 'green' | 'orange' | 'white';
export interface ToeiGuidanceSegment {
  text: string;
  tone: ToeiGuidanceTone;
}
export interface ToeiGuidanceMessage {
  id: string;
  source: string;
  segments: ToeiGuidanceSegment[];
}

export type ToeiInformationMessage = Pick<ToeiGuidanceMessage, 'id' | 'segments'>;

/** One shuffled deck per round; avoid repeating the previous round's final notice. */
export function shuffledGuidanceIds(
  ids: readonly string[],
  previousLast?: string,
  random: () => number = Math.random,
): string[] {
  const result = [...ids];
  for (let index = result.length - 1; index > 0; index--) {
    const other = Math.floor(random() * (index + 1));
    [result[index], result[other]] = [result[other], result[index]];
  }
  if (result.length > 1 && result[0] === previousLast) {
    const other = 1 + Math.floor(random() * (result.length - 1));
    [result[0], result[other]] = [result[other], result[0]];
  }
  return result;
}

/** Prioritize reported disruptions; only claim no delays with a normal-status report. */
export function toeiInformationMessages(
  operation: LineOperation | undefined,
  previous: boolean,
): readonly ToeiInformationMessage[] {
  const prefix: ToeiGuidanceSegment[] = previous ? [{ text: '前回取得時：', tone: 'orange' }] : [];
  if (operation && operation.state !== 'normal') {
    return [
      {
        id: 'operation',
        segments: [
          { text: '【運行情報】', tone: 'red' },
          ...prefix,
          {
            text: operation.message || operation.status,
            tone: operation.state === 'suspended' ? 'red' : 'orange',
          },
        ],
      },
      ...TOEI_GUIDANCE,
    ];
  }
  if (!operation) return TOEI_GUIDANCE;
  return [
    ...TOEI_GUIDANCE,
    {
      id: 'no-delays',
      segments: [...prefix, { text: '15分以上の遅延情報はありません。', tone: 'white' }],
    },
  ];
}

// Original, shortened wording based on Toei's current passenger-safety guidance.
// Color roles follow the photographed LCD notices (red headings/warnings,
// green body, orange emphasis); no simulator program or image assets are reused.
// https://r113.sakura.ne.jp/p/hasshahyo/toei-lcd-2019/index.html
export const TOEI_GUIDANCE: readonly ToeiGuidanceMessage[] = [
  {
    id: 'phone-etiquette',
    source: 'https://www.kotsu.metro.tokyo.jp/pickup_information/manner.html',
    segments: [
      { text: '【お願い】', tone: 'red' },
      { text: '携帯電話は', tone: 'green' },
      { text: 'マナーモード', tone: 'orange' },
      {
        text: 'でご利用いただき、車内での通話はお控えください。混雑時、優先席の近くでは電源をお切りください。',
        tone: 'green',
      },
    ],
  },
  {
    id: 'priority-seats',
    source: 'https://www.kotsu.metro.tokyo.jp/pickup_information/manner.html',
    segments: [
      { text: '【お願い】', tone: 'red' },
      { text: 'ご高齢の方、お体の不自由な方、妊娠中の方、乳幼児をお連れの方、', tone: 'green' },
      { text: 'ヘルプマークをお持ちの方', tone: 'orange' },
      { text: 'など、座席を必要とする方へのお心配りをお願いします。', tone: 'green' },
    ],
  },
  {
    id: 'walking-phone',
    source: 'https://www.kotsu.metro.tokyo.jp/subway/kanren/keitai/mechanism.html',
    segments: [
      { text: '【お願い】', tone: 'red' },
      { text: '駅構内での', tone: 'green' },
      { text: '歩きながらのスマートフォン操作', tone: 'orange' },
      { text: 'は危険です。周囲に気を付け、立ち止まってご利用ください。', tone: 'green' },
    ],
  },
  {
    id: 'boarding-order',
    source: 'https://www.kotsu.metro.tokyo.jp/pickup_information/manner.pdf',
    segments: [
      { text: '【お願い】', tone: 'red' },
      { text: '電車をお待ちの際は整列し、', tone: 'green' },
      { text: '降りる方が先', tone: 'orange' },
      {
        text: 'になるよう、順番にご乗車ください。駆け込み乗車やホームドアへの寄り掛かりは危険です。',
        tone: 'green',
      },
    ],
  },
  {
    id: 'no-smoking',
    source: 'https://www.kotsu.metro.tokyo.jp/pickup_information/manner.html',
    segments: [
      { text: '【ご案内】', tone: 'red' },
      { text: '駅構内・車内は', tone: 'green' },
      { text: '終日禁煙', tone: 'orange' },
      {
        text: 'です。電子たばこなども使用せず、皆様が快適に利用できる環境づくりにご協力ください。',
        tone: 'green',
      },
    ],
  },
  {
    id: 'onboard-emergency',
    source:
      'https://www.kotsu.metro.tokyo.jp/initiatives/safety/measures_disaster/subway_car/index.html',
    segments: [
      { text: '【お願い】', tone: 'red' },
      { text: '車内', tone: 'orange' },
      { text: 'で', tone: 'green' },
      { text: '緊急事態が起きたとき', tone: 'red' },
      { text: 'は、', tone: 'green' },
      { text: '非常通報器のボタン', tone: 'red' },
      { text: 'を押して', tone: 'green' },
      { text: '乗務員にお知らせください。', tone: 'orange' },
      { text: 'インターホンで状況を伝えられます。', tone: 'green' },
    ],
  },
  {
    id: 'platform-emergency',
    source: 'https://www.kotsu.metro.tokyo.jp/subway/kanren/pdf/handbook.pdf',
    segments: [
      { text: '【お願い】', tone: 'red' },
      { text: 'お客様が', tone: 'green' },
      { text: '線路に転落したとき', tone: 'red' },
      { text: 'は、ホームの', tone: 'green' },
      { text: '非常停止ボタン', tone: 'red' },
      { text: 'を押して、', tone: 'green' },
      { text: '係員へお知らせください。', tone: 'orange' },
    ],
  },
  {
    id: 'suspicious-items',
    source: 'https://www.kotsu.metro.tokyo.jp/initiatives/safety/measures_terrorism/index.html',
    segments: [
      { text: '【お願い】', tone: 'red' },
      { text: '駅や車内で', tone: 'green' },
      { text: '不審な物や人', tone: 'orange' },
      { text: 'に気付いたら、', tone: 'green' },
      { text: 'お近くの駅係員または乗務員', tone: 'orange' },
      { text: 'へお知らせください。', tone: 'green' },
    ],
  },
  {
    id: 'escalator',
    source: 'https://www.kotsu.metro.tokyo.jp/enq/faq/subway.html',
    segments: [
      { text: '【ご案内】', tone: 'red' },
      { text: 'エスカレーターでは、', tone: 'green' },
      { text: '手すりにつかまり', tone: 'orange' },
      { text: '、', tone: 'green' },
      { text: '歩かずに立ち止まって', tone: 'orange' },
      { text: 'ご利用ください。', tone: 'green' },
    ],
  },
];
