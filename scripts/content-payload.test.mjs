/**
 * The rendered documentation payload (src/assets/content), as the app ships it.
 *
 *   npm run build:content && node --test scripts/content-payload.test.mjs
 *
 * `npm test` renders the payload first (pretest), so this always reads the
 * output of the current scripts/build-content.mjs over the current content/.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'src/assets/content');
const index = JSON.parse(await readFile(path.join(OUT, 'index.json'), 'utf8'));
const pages = [];
for (const s of index.sections) {
  for (const d of s.docs) pages.push(JSON.parse(await readFile(path.join(OUT, s.id, `${d.slug}.json`), 'utf8')));
}
const hrefs = (html) => [...html.matchAll(/<a\b[^>]*?\bhref="([^"]*)"/g)].map((m) => m[1]);

test('the payload has every page of the index', async () => {
  const files = (await readdir(OUT, { recursive: true })).filter((f) => f.endsWith('.json'));
  assert.ok(pages.length > 200, `only ${pages.length} pages`);
  assert.equal(files.length, pages.length + 2, 'one file per page, plus index.json and search.json');
});

test('no link is a bare #fragment: with <base href="/"> that resolves to the home page', () => {
  const bad = pages.flatMap((p) => hrefs(p.html).filter((h) => h.startsWith('#')).map((h) => `${p.route}: ${h}`));
  assert.deepEqual(bad, []);
});

test('every heading permalink names its own page', () => {
  let n = 0;
  for (const p of pages) {
    for (const m of p.html.matchAll(/class="heading-anchor" href="([^"]*)"/g)) {
      n++;
      assert.ok(m[1].startsWith(`${p.route}#`), `${p.route}: ${m[1]}`);
    }
  }
  assert.ok(n > 500, `only ${n} permalinks: is the renderer still emitting them?`);
});

test('no link points at an org or repository name that does not exist', () => {
  const dead = /^https?:\/\/(www\.)?github\.com\/(hugmesh-net(\/|$)|hugmesh\/(hugmesh-(admin|forum|mod|owncast|tube|user|wiki)-bff|login-ui|user-bff|hugmesh-ui-standard|catalyst-scripts)(\/|$|#))/i;
  const bad = pages.flatMap((p) => hrefs(p.html).filter((h) => dead.test(h)).map((h) => `${p.route}: ${h}`));
  assert.deepEqual(bad, []);
});

test('the repositories are public, so every page links its source file', () => {
  const vendored = pages.filter((p) => p.source);
  assert.ok(vendored.length > 200);
  for (const p of vendored) {
    assert.equal(p.source.url, `https://github.com/hugmesh/${p.source.repo}/blob/main/${p.source.path}`, p.route);
  }
});
