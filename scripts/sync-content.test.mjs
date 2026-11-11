/**
 * Re-vendoring one page (scripts/sync-content.mjs --only <page> --update-lock).
 *
 *   node --test scripts/sync-content.test.mjs
 *
 * The lock is what makes a hand-edited vendored file a build failure, so a
 * targeted update must replace the records it re-vendored and keep every other.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mergeLockRecords } from './sync-content.mjs';

const rec = (p, sha) => ({ path: p, sourceRepo: 'hugmesh-generator', sourcePath: `docs/${p}`, sourceRef: 'abc', sha256: sha });

test('a targeted update replaces only the records it re-vendored', () => {
  const before = [rec('content/a.md', '1'), rec('content/b.md', '2'), rec('content/c.md', '3')];
  const after = mergeLockRecords(before, [{ ...rec('content/b.md', '9'), sourceRef: 'def' }]);
  assert.equal(after.length, 3, 'no record is dropped');
  assert.deepEqual(after.find((r) => r.path === 'content/a.md'), before[0]);
  assert.deepEqual(after.find((r) => r.path === 'content/c.md'), before[2]);
  assert.equal(after.find((r) => r.path === 'content/b.md').sha256, '9');
  assert.equal(after.find((r) => r.path === 'content/b.md').sourceRef, 'def');
});

test('a page new to the lock is added, and the result stays sorted by path', () => {
  const after = mergeLockRecords([rec('content/z.md', '1')], [rec('content/m.md', '2')]);
  assert.deepEqual(after.map((r) => r.path), ['content/m.md', 'content/z.md']);
});
