import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_DEPARTURE_POLICY,
  DEPARTURE_POLICY_KEY,
  readDeparturePolicy,
} from '../src/lib/departure-policy.ts';

function withStorage(
  session: string | null,
  device: string | null,
  run: (tab: Map<string, string>) => void,
) {
  const beforeSession = Object.getOwnPropertyDescriptor(globalThis, 'sessionStorage');
  const beforeLocal = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const tab = new Map(session === null ? [] : [[DEPARTURE_POLICY_KEY, session]]);
  Object.defineProperty(globalThis, 'sessionStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => tab.get(key) ?? null,
      setItem: (key: string, value: string) => tab.set(key, value),
    },
  });
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: { getItem: () => device },
  });
  try {
    run(tab);
  } finally {
    if (beforeSession) Object.defineProperty(globalThis, 'sessionStorage', beforeSession);
    else Reflect.deleteProperty(globalThis, 'sessionStorage');
    if (beforeLocal) Object.defineProperty(globalThis, 'localStorage', beforeLocal);
    else Reflect.deleteProperty(globalThis, 'localStorage');
  }
}

test('fresh and invalid settings use the hybrid default without persisting an override', () => {
  assert.equal(DEFAULT_DEPARTURE_POLICY, 'hybrid');
  for (const [session, device] of [
    [null, null],
    ['invalid', null],
    [null, 'invalid'],
  ])
    withStorage(session, device, (tab) => {
      assert.equal(readDeparturePolicy(), 'hybrid');
      assert.equal(tab.get(DEPARTURE_POLICY_KEY), session ?? undefined);
    });
});

test('explicit legacy is preserved and session settings take priority over device settings', () => {
  withStorage('hybrid', null, () => assert.equal(readDeparturePolicy(), 'hybrid'));
  withStorage(null, 'hybrid', () => assert.equal(readDeparturePolicy(), 'hybrid'));
  withStorage('legacy', null, () => assert.equal(readDeparturePolicy(), 'legacy'));
  withStorage('legacy', 'hybrid', () => assert.equal(readDeparturePolicy(), 'legacy'));
  withStorage('hybrid', 'legacy', () => assert.equal(readDeparturePolicy(), 'hybrid'));
  withStorage(null, 'legacy', (tab) => {
    assert.equal(readDeparturePolicy(), 'legacy');
    assert.equal(tab.get(DEPARTURE_POLICY_KEY), 'legacy');
    assert.equal(readDeparturePolicy(), 'legacy');
  });
});

test('unavailable storage falls back to the shipped hybrid default', () => {
  withStorage(null, 'legacy', () => {
    Object.defineProperty(globalThis, 'sessionStorage', {
      configurable: true,
      get() {
        throw new Error('Storage unavailable');
      },
    });
    assert.equal(readDeparturePolicy(), 'hybrid');
  });
});
