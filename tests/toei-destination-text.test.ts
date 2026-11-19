import test from 'node:test';
import assert from 'node:assert/strict';
import { toeiDestinationTranslation } from '../src/lib/toei-destination-text.ts';

const station = (name: string, reading?: string, english?: string) => ({
  name,
  reading,
  english,
  code: undefined,
});

test('経由案内は言語ごとの駅順と補助語を保つ', () => {
  const destination = {
    stations: [
      station('六本木', 'ろっぽんぎ', 'Roppongi'),
      station('光が丘', 'ひかりがおか', 'Hikarigaoka'),
    ],
    via: true,
    terminal: false,
  };
  assert.deepEqual(toeiDestinationTranslation(destination, 'ja'), {
    language: 'ja',
    lines: [
      { text: 'ろっぽんぎ', suffix: 'けいゆ' },
      { text: 'ひかりがおか', suffix: 'ゆき' },
    ],
  });
  assert.deepEqual(toeiDestinationTranslation(destination, 'en')?.lines, [
    { text: 'For Hikarigaoka' },
    { text: 'via Roppongi' },
  ]);
  assert.deepEqual(toeiDestinationTranslation(destination, 'zh-Hans')?.lines, [
    { text: '开往光丘' },
    { text: '经由六本木' },
  ]);
  assert.deepEqual(toeiDestinationTranslation(destination, 'ko')?.lines, [
    { text: '롯폰기 경유' },
    { text: '히카리가오카행' },
  ]);
});

test('翻訳のない行先は案内全体を英語へ戻し、日本語と多言語の語尾を混ぜない', () => {
  const destination = {
    stations: [
      station('六本木', 'ろっぽんぎ', 'Roppongi'),
      station('未登録駅', 'みとうろくえき', 'Unlisted'),
    ],
    via: true,
    terminal: false,
  };
  for (const language of ['zh-Hans', 'ko'] as const)
    assert.deepEqual(toeiDestinationTranslation(destination, language), {
      language: 'en',
      lines: [{ text: 'For Unlisted' }, { text: 'via Roppongi' }],
    });
  assert.equal(
    toeiDestinationTranslation(
      { stations: [station('未登録駅')], via: false, terminal: true },
      'ko',
    ),
    undefined,
  );
});

test('かなのない羽田空港も中国語・韓国語の駅名で案内する', () => {
  const destination = {
    stations: [station('羽田空港第１・第２ターミナル', undefined, 'Haneda Airport Terminal 1・2')],
    via: false,
    terminal: true,
  };
  assert.deepEqual(toeiDestinationTranslation(destination, 'ja'), {
    language: 'en',
    lines: [{ text: 'For Haneda Airport ' }, { text: 'Terminal 1・2' }],
  });
  assert.deepEqual(toeiDestinationTranslation(destination, 'zh-Hans'), {
    language: 'zh-Hans',
    lines: [{ text: '开往羽田机场' }, { text: '第1・第2航站楼' }],
  });
  assert.deepEqual(toeiDestinationTranslation(destination, 'ko'), {
    language: 'ko',
    lines: [{ text: '하네다공항 ' }, { text: '제1·제2터미널행' }],
  });
});
