import test from 'node:test';
import assert from 'node:assert/strict';
import { requestLocationOnce } from '../src/lib/location-request.ts';

const position = {
  coords: {
    latitude: 35.6,
    longitude: 139.7,
    accuracy: 20,
    altitude: null,
    altitudeAccuracy: null,
    heading: null,
    speed: null,
  },
  timestamp: 1,
} as GeolocationPosition;

function provider(synchronous?: 'success' | 'error' | 'throw') {
  const calls: {
    success: PositionCallback;
    error: PositionErrorCallback;
    options?: PositionOptions;
  }[] = [];
  const cleared: number[] = [];
  const geolocation: Pick<Geolocation, 'watchPosition' | 'clearWatch'> = {
    watchPosition(success, error, options) {
      if (synchronous === 'throw') throw new Error('Provider unavailable');
      calls.push({ success, error: error!, options });
      if (synchronous === 'success') success(position);
      if (synchronous === 'error') error!({ code: 1 } as GeolocationPositionError);
      return calls.length - 1;
    },
    clearWatch(id) {
      cleared.push(id);
    },
  };
  return { geolocation, calls, cleared };
}

test('最初の測位成功で購読を解除し、追加の位置・エラーを通知しない', () => {
  const p = provider();
  const positions: GeolocationPosition[] = [];
  const errors: number[] = [];
  const stop = requestLocationOnce(
    p.geolocation,
    (p) => positions.push(p),
    (code) => errors.push(code),
  );
  assert.deepEqual(p.calls[0].options, {
    enableHighAccuracy: false,
    timeout: 10000,
    maximumAge: 0,
  });
  p.calls[0].success(position);
  assert.deepEqual(p.cleared, [0]);
  p.calls[0].success(position);
  p.calls[0].error({ code: 2 } as GeolocationPositionError);
  stop();
  stop();
  assert.equal(positions.length, 1);
  assert.deepEqual(errors, []);
  assert.deepEqual(p.cleared, [0]);
});

for (const code of [1, 2, 3]) {
  test(`測位エラー${code}でも購読を解除し、自動再試行しない`, () => {
    const p = provider();
    const errors: number[] = [];
    requestLocationOnce(
      p.geolocation,
      () => assert.fail('Unexpected position'),
      (error) => errors.push(error),
    );
    p.calls[0].error({ code } as GeolocationPositionError);
    p.calls[0].success(position);
    assert.deepEqual(p.cleared, [0]);
    assert.deepEqual(errors, [code]);
    assert.equal(p.calls.length, 1);
  });
}

test('許可待ちを含め15秒で購読を解除し、遅い成功通知を無視する', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const p = provider();
  const errors: number[] = [];
  requestLocationOnce(
    p.geolocation,
    () => assert.fail('Late position'),
    (code) => errors.push(code),
  );
  t.mock.timers.tick(14999);
  assert.deepEqual(p.cleared, []);
  t.mock.timers.tick(1);
  assert.deepEqual(p.cleared, [0]);
  assert.deepEqual(errors, [3]);
  p.calls[0].success(position);
  t.mock.timers.tick(30000);
  assert.equal(p.calls.length, 1);
  assert.deepEqual(errors, [3]);
});

test('手動取消は購読とタイマーを解除し、遅いコールバックを通知しない', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const p = provider();
  const stop = requestLocationOnce(
    p.geolocation,
    () => assert.fail('Canceled position'),
    () => assert.fail('Canceled error'),
  );
  stop();
  p.calls[0].success(position);
  p.calls[0].error({ code: 3 } as GeolocationPositionError);
  t.mock.timers.tick(30000);
  assert.deepEqual(p.cleared, [0]);
});

for (const synchronous of ['success', 'error'] as const) {
  test(`IDを返す前の同期${synchronous}でも返された購読を解除する`, (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const p = provider(synchronous);
    let notified = 0;
    const stop = requestLocationOnce(
      p.geolocation,
      () => notified++,
      () => notified++,
    );
    stop();
    t.mock.timers.tick(30000);
    assert.equal(notified, 1);
    assert.deepEqual(p.cleared, [0]);
  });
}

test('取得APIの例外でも時間切れタイマーを残さず失敗を1回だけ通知する', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const p = provider('throw');
  const errors: number[] = [];
  requestLocationOnce(
    p.geolocation,
    () => assert.fail('Unexpected position'),
    (code) => errors.push(code),
  );
  t.mock.timers.tick(30000);
  assert.deepEqual(errors, [2]);
  assert.deepEqual(p.cleared, []);
});

test('旧要求の取消や遅い結果は、新しい要求の購読を解除しない', () => {
  const p = provider();
  const stopOld = requestLocationOnce(
    p.geolocation,
    () => assert.fail('Old position'),
    () => assert.fail('Old error'),
  );
  stopOld();
  let received = 0;
  requestLocationOnce(
    p.geolocation,
    () => received++,
    () => assert.fail('New error'),
  );
  stopOld();
  p.calls[0].success(position);
  assert.deepEqual(p.cleared, [0]);
  p.calls[1].success(position);
  assert.equal(received, 1);
  assert.deepEqual(p.cleared, [0, 1]);
});
