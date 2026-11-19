import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { STATIONS } from '../shared/stations.ts';
import {
  DESTINATIONS_EN,
  destinationPresentation,
  englishPlatform,
} from '../src/lib/destinations.ts';
import type { StationData } from '../src/types.ts';

test('発車標の行先では副駅名・事業者・地域の括弧書きを省き、英語の照合キーを保つ', () => {
  for (const [source, name] of [
    ['押上', '押上'],
    ['大門', '大門'],
    ['成田空港(鉄道)', '成田空港'],
    ['羽田空港第１・第２ターミナル(京急)', '羽田空港第１・第２ターミナル'],
    ['海老名(相鉄・小田急)', '海老名'],
    ['橋本(神奈川県)', '橋本'],
    ['駅名（補足）', '駅名'],
  ]) {
    assert.equal(destinationPresentation(source).name, name);
    assert.equal(destinationPresentation(source).english, DESTINATIONS_EN[source]);
  }
});

test('全駅・全曜日の行先に英語表記を用意し、各番線を英語で案内する', () => {
  for (const station of STATIONS) {
    const data: StationData = JSON.parse(readFileSync(`public/data/${station.id}.json`, 'utf8'));
    for (const route of data.routes)
      for (const schedule of Object.values(route.schedules)) {
        for (const train of schedule) {
          const english = DESTINATIONS_EN[train.destination];
          assert.ok(english, `${station.name}: ${train.destination} の英語表記が必要です`);
          assert.doesNotMatch(english, /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u);
          if (train.platform)
            assert.doesNotMatch(englishPlatform(train.platform), /[\p{Script=Han}]/u);
        }
      }
  }
});

test('山手線の方面案内と終着駅を区別し、他路線の行先表示を保つ', () => {
  assert.deepEqual(destinationPresentation('環状運転', '渋谷・新宿'), {
    name: '山手線　渋谷・新宿',
    suffix: '方面',
    english: 'Yamanote Line　For Shibuya / Shinjuku',
    englishPrefix: '',
  });
  for (const destination of ['大崎', '池袋', '品川']) {
    const yamanote = destinationPresentation(destination, '渋谷・新宿');
    const other = destinationPresentation(destination);
    assert.equal(yamanote.name + yamanote.suffix, `${destination}行`);
    assert.equal(other.name + other.suffix, `${destination} 行き`);
    assert.equal(yamanote.english, other.english);
    assert.equal(yamanote.englishPrefix, 'For ');
  }
  assert.equal(destinationPresentation('環状運転').englishPrefix, '');
});

test('全駅・全曜日の山手線で、方面と終着駅の両方に英語案内を用意する', () => {
  for (const station of STATIONS) {
    const data: StationData = JSON.parse(readFileSync(`public/data/${station.id}.json`, 'utf8'));
    for (const route of data.routes.filter((route) => route.line.includes('山手線'))) {
      const destinations = new Set(
        Object.values(route.schedules)
          .flat()
          .map((train) => train.destination),
      );
      for (const destination of destinations) {
        const presentation = destinationPresentation(destination, route.direction);
        assert.ok(presentation.english, `${station.name}: ${route.direction} / ${destination}`);
        assert.doesNotMatch(
          presentation.english,
          /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u,
        );
      }
    }
  }
});

test('未登録の行先・方面は日本語を保ち、不完全な英訳や継承プロパティを表示しない', () => {
  for (const destination of ['未登録の駅', 'toString', 'constructor']) {
    const presentation = destinationPresentation(destination, '渋谷・新宿');
    assert.equal(presentation.name + presentation.suffix, `${destination}行`);
    assert.equal(presentation.english, undefined);
  }
  const loop = destinationPresentation('環状運転', '東京・未登録の駅');
  assert.equal(loop.name + loop.suffix, '山手線　東京・未登録の駅方面');
  assert.equal(loop.english, undefined);
});

test('地下・複数番線と、行先を持たない環状運転を区別する', () => {
  assert.equal(englishPlatform('１'), 'Platform 1');
  assert.equal(englishPlatform('1・2'), 'Platforms 1 / 2');
  assert.equal(englishPlatform('地下1'), 'Underground platform 1');
  assert.equal(DESTINATIONS_EN['環状運転'], 'Loop service');
  assert.equal(
    DESTINATIONS_EN['羽田空港第１・第２ターミナル(京急)'],
    'Haneda Airport Terminal 1・2',
  );
  assert.equal(DESTINATIONS_EN['未登録の駅'], undefined);
});
