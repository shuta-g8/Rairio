import test from 'node:test';
import assert from 'node:assert/strict';
import { toeiTrainTypeColor, toeiTrainTypeDisplay } from '../src/lib/toei-train-type.ts';

test('浅草線の各種別色を区別し、特急に含まれる通勤・アクセスを誤分類しない', () => {
  for (const [type, color] of Object.entries({
    普通: 'transparent',
    快速: '#de5089',
    急行: '#005cc5',
    特急: '#ff0000',
    快特: '#009442',
    通勤特急: '#38a9dd',
    アクセス特急: '#ff7d1a',
    エアポート快特: '#ff9800',
  }))
    assert.equal(toeiTrainTypeColor(type, 'Asakusa'), color, type);
});

test('提供されたLCD画像の先発・次発の種別名と改行位置を使う', () => {
  assert.deepEqual(toeiTrainTypeDisplay('アクセス特急', 'Asakusa', 'ja', false), {
    name: '特 急',
    prefix: 'アクセス',
    airplane: false,
    translation: ['あくせすとっきゅう'],
  });
  for (const [type, language, lines] of [
    ['普通', 'ja', ['ふつう']],
    ['特急', 'ja', ['とっきゅう']],
    ['アクセス特急', 'ja', ['あくせす', 'とっきゅう']],
    ['アクセス特急', 'en', ['Access', 'Exp.']],
    ['エアポート快特', 'ja', ['えあぽーと', 'かいとく']],
    ['エアポート快特', 'en', ['Limited', 'Exp.']],
  ] as const) {
    assert.deepEqual(toeiTrainTypeDisplay(type, 'Asakusa', language, true).translation, lines);
  }
  assert.equal(toeiTrainTypeDisplay('エアポート快特', 'Asakusa', 'en', true).airplane, true);
  assert.deepEqual(
    toeiTrainTypeDisplay('快速特急', 'Asakusa', 'en', true),
    toeiTrainTypeDisplay('快特', 'Asakusa', 'en', true),
  );
  assert.equal(toeiTrainTypeDisplay('普通', 'Mita', 'ja', true).name, '各停');
  assert.equal(toeiTrainTypeDisplay('普通', 'Asakusa', 'ja', true).name, '普通');
  assert.equal(toeiTrainTypeDisplay('特急', 'Asakusa', 'en', true).name, '特急');
  assert.equal(toeiTrainTypeDisplay('通勤特急', 'Asakusa', 'ja', true).name, '通特');
  assert.equal(toeiTrainTypeDisplay('通勤特急', 'Asakusa', 'ja', false).name, '通 特');
  assert.equal(toeiTrainTypeDisplay('通勤特急', 'Asakusa', 'ja', false).prefix, '');
  for (const secondary of [false, true])
    assert.deepEqual(toeiTrainTypeDisplay('通勤特急', 'Asakusa', 'ja', secondary).translation, [
      'つうとく',
    ]);
  assert.equal(toeiTrainTypeDisplay('エアポート快特', 'Asakusa', 'en', true).name, '快特');
  assert.deepEqual(toeiTrainTypeDisplay('不明', 'Asakusa', 'en', true).translation, []);
});

test('各駅停車・急行の色は路線ごとに分け、不明な種別を推定で着色しない', () => {
  assert.equal(toeiTrainTypeColor('普通', 'Mita'), '#006bb9');
  assert.equal(toeiTrainTypeColor('各駅停車', 'Shinjuku'), '#8b9e25');
  assert.equal(toeiTrainTypeColor('急行', 'Mita'), '#d32729');
  assert.equal(toeiTrainTypeColor('急行', 'Shinjuku'), '#d32729');
  assert.equal(toeiTrainTypeColor('不明', 'Asakusa'), 'transparent');
});
