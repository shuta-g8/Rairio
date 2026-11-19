import test from 'node:test';
import assert from 'node:assert/strict';
import { STATIONS } from '../shared/stations.ts';
import { nearbyToeiStation } from '../src/lib/nearby-station.ts';

test('公式の駅座標から都営4路線の近くの駅を選ぶ', () => {
  for (const id of ['togoshi', 'kachidoki', 'nishitakashimadaira', 'shinozaki']) {
    const station = STATIONS.find((s) => s.id === id)!;
    const { latitude, longitude } = station.memberships![0];
    const result = nearbyToeiStation({ latitude: latitude + 0.0001, longitude, accuracy: 30 });
    assert.equal(result.kind, 'found');
    if (result.kind === 'found') {
      assert.equal(result.station.id, id);
      assert.ok(result.distanceMeters > 10 && result.distanceMeters < 12);
    }
  }
});

test('3kmを超える現在地や精度が低い現在地から駅を選ばない', () => {
  assert.equal(
    nearbyToeiStation({ latitude: 34.7025, longitude: 135.4959, accuracy: 20 }).kind,
    'far',
  );
  const { latitude, longitude } = STATIONS.find((s) => s.id === 'togoshi')!.memberships![0];
  assert.equal(nearbyToeiStation({ latitude, longitude, accuracy: 1001 }).kind, 'inaccurate');
});

test('半径の境界付近をメートル単位で判定する', () => {
  const station = STATIONS.find((s) => s.id === 'togoshi')!;
  const { latitude, longitude } = station.memberships![0];
  const offset = (meters: number) => latitude + ((meters / 6371000) * 180) / Math.PI;
  assert.equal(
    nearbyToeiStation({ latitude: offset(2999), longitude, accuracy: 10 }, [station]).kind,
    'found',
  );
  assert.equal(
    nearbyToeiStation({ latitude: offset(3001), longitude, accuracy: 10 }, [station]).kind,
    'far',
  );
});

test('不正な座標・精度を受け取っても駅を選ばない', () => {
  for (const coordinates of [
    { latitude: NaN, longitude: 139.7, accuracy: 10 },
    { latitude: 91, longitude: 139.7, accuracy: 10 },
    { latitude: 35.6, longitude: -181, accuracy: 10 },
    { latitude: 35.6, longitude: Infinity, accuracy: 10 },
    { latitude: 35.6, longitude: 139.7, accuracy: -1 },
    { latitude: 35.6, longitude: 139.7, accuracy: NaN },
  ])
    assert.equal(nearbyToeiStation(coordinates).kind, 'unavailable');
});
