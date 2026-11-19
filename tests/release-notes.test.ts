import assert from 'node:assert/strict';
import test from 'node:test';
import app from '../package.json' with { type: 'json' };
import lockfile from '../package-lock.json' with { type: 'json' };
import { RELEASE_NOTES } from '../src/lib/release-notes.ts';

test('アプリのバージョンがロックファイルと最新の更新履歴で一致する', () => {
  assert.equal(lockfile.version, app.version);
  assert.equal(lockfile.packages[''].version, app.version);
  assert.equal(RELEASE_NOTES[0]?.version, app.version);
});
