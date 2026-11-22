import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { STATIONS } from '../shared/stations.ts';
import type { StationData } from '../src/types.ts';
import { JOURNEY_GTFS_CATALOG } from '../shared/journey-sources.ts';
import { TRAIN_TYPE_LABELS, trainTypeLabel } from '../src/lib/train-type.ts';

test('三田・新宿の普通を各停として表示し、浅草・大江戸や優等種別は維持する', () => {
  for (const line of ['Mita', 'Shinjuku']) {
    for (const type of ['普通', '各駅停車', '各停']) {
      assert.equal(trainTypeLabel(type, true, line), '各停');
      assert.equal(trainTypeLabel(type, false, line), '各停');
    }
    assert.equal(trainTypeLabel('急行', true, line), '急行');
  }
  for (const line of ['Asakusa', 'Oedo', ''])
    assert.equal(trainTypeLabel('普通', true, line), '普通');
  assert.equal(trainTypeLabel('快速特急', true, 'Asakusa'), '快特');
});

test('全駅・全曜日の種別を識別可能な2文字で表示する', () => {
  const types = new Set<string>();
  for (const station of STATIONS) {
    const data: StationData = JSON.parse(readFileSync(`public/data/${station.id}.json`, 'utf8'));
    for (const route of data.routes)
      for (const trains of Object.values(route.schedules)) {
        for (const train of trains) {
          if (train.gtfs) {
            assert.equal(route.railwayId, 'Asakusa');
            assert.equal(route.sourceUrl, JOURNEY_GTFS_CATALOG);
            assert.equal(train.type, '');
          } else types.add(train.type);
        }
      }
  }
  const labels = [...types].map((type) => {
    assert.ok(Object.hasOwn(TRAIN_TYPE_LABELS, type), `${type} の略称が必要です`);
    const label = trainTypeLabel(type);
    assert.equal([...label.replaceAll(' ', '')].length, 2, type);
    return label;
  });
  assert.equal(new Set(labels).size, types.size);
  assert.equal(trainTypeLabel('アクセス特急'), 'ア特');
  assert.equal(trainTypeLabel('エアポート快特'), 'エ快');
  assert.equal(trainTypeLabel('通勤特急'), '通特');
  assert.equal(trainTypeLabel('普通'), '普通');
  assert.equal(trainTypeLabel('各駅停車'), '各停');
  assert.equal(trainTypeLabel('普通', true), '普通');
  assert.equal(trainTypeLabel('各駅停車', true), '各停');
  assert.equal(trainTypeLabel('特急', true), '特急');
  // A new source type must never be silently truncated into a different service.
  assert.equal(trainTypeLabel('未登録の種別'), '未登録の種別');
});

test('サイトデフォルトの全登録略称を先発・次発とも空白なしで統一する', () => {
  for (const [type, label] of Object.entries(TRAIN_TYPE_LABELS)) {
    assert.equal(trainTypeLabel(type), label, type);
    assert.equal(trainTypeLabel(type, true), label, type);
  }
  assert.equal(trainTypeLabel('京急ウイング'), 'Ｗ号');
  assert.equal(trainTypeLabel('Ｓ−ＴＲＡＩＮ'), 'ＳＴ');
});
