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
const manifest = JSON.parse(await readFile(path.join(ROOT, 'docs.manifest.json'), 'utf8'));
const index = JSON.parse(await readFile(path.join(OUT, 'index.json'), 'utf8'));
const pages = [];
for (const s of index.sections) {
  for (const d of s.docs) pages.push(JSON.parse(await readFile(path.join(OUT, s.id, `${d.slug}.json`), 'utf8')));
}
const hrefs = (html) => [...html.matchAll(/<a\b[^>]*?\bhref="([^"]*)"/g)].map((m) => m[1]);

test('the payload has every page of the manifest, and nothing else', async () => {
  const files = (await readdir(OUT, { recursive: true })).filter((f) => f.endsWith('.json'));
  assert.equal(pages.length, manifest.docs.length, 'one page per manifest entry');
  assert.equal(files.length, pages.length + 2, 'one file per page, plus index.json and search.json');
});

test('every page is listed in exactly one group of exactly one tab, and every listed route resolves', () => {
  const byRoute = new Map(index.sections.flatMap((s) => s.docs).map((d) => [d.route, d]));
  const seen = new Map();
  for (const s of index.sections) {
    for (const g of s.groups) {
      for (const r of g.routes) {
        assert.ok(!seen.has(r), `${r} is listed in ${seen.get(r)} and ${s.id}/${g.id}`);
        seen.set(r, `${s.id}/${g.id}`);
        if (r === '/downloads') continue;
        const d = byRoute.get(r);
        assert.ok(d, `${s.id}/${g.id} lists ${r}, which is not a page`);
        assert.equal(d.navSection, s.id, `${r}: navSection`);
        assert.equal(d.navGroup, g.id, `${r}: navGroup`);
      }
    }
  }
  for (const r of byRoute.keys()) assert.ok(seen.has(r), `${r} is in no group`);
});

test('every tab has its intro rendered, and redirects point at live pages', () => {
  for (const s of index.sections) assert.match(s.introHtml, /<p>/, `${s.id} intro`);
  const live = new Set(index.sections.flatMap((s) => s.docs.map((d) => d.route)));
  for (const s of index.sections) live.add(`/${s.id}`);
  for (const [from, to] of Object.entries(index.redirects)) {
    assert.ok(!live.has(from), `${from} is redirected but still served`);
    assert.ok(live.has(to.split('#')[0]), `${from} -> ${to}, which is not a page`);
  }
  assert.equal(Object.keys(index.redirects).length, manifest.redirects.length);
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
  assert.ok(n > 400, `only ${n} permalinks: is the renderer still emitting them?`);
});

test('no link points at an org or repository name that does not exist', () => {
  const dead = /^https?:\/\/(www\.)?github\.com\/(hugmesh-net(\/|$)|hugmesh\/(hugmesh-(admin|forum|mod|owncast|tube|user|wiki)-bff|login-ui|user-bff|hugmesh-ui-standard|catalyst-scripts)(\/|$|#))/i;
  const bad = pages.flatMap((p) => hrefs(p.html).filter((h) => dead.test(h)).map((h) => `${p.route}: ${h}`));
  assert.deepEqual(bad, []);
});

test('a page written for the site links each file it was checked against, at the recorded commit', () => {
  const declared = manifest.docs.filter((d) => d.authored && d.basis.length > 0);
  assert.ok(declared.length > 20, `only ${declared.length} site-written pages declare a basis`);
  for (const d of declared) {
    const route = `/${d.section}/${d.slug}`;
    const p = pages.find((x) => x.route === route);
    assert.equal(p.source, null, route);
    assert.deepEqual(p.basis.map((b) => `${b.repo}/${b.path}`), d.basis.map((b) => `${b.repo}/${b.path}`), route);
    for (const b of p.basis) {
      assert.match(b.ref, /^[0-9a-f]{40}$/, route);
      assert.equal(b.url, `https://github.com/hugmesh/${b.repo}/blob/${b.ref}/${b.path}`, route);
    }
  }
  for (const p of pages.filter((x) => x.source)) assert.deepEqual(p.basis, [], p.route);
});

test('the repositories are public, so every page links its source file', () => {
  const vendored = pages.filter((p) => p.source);
  assert.equal(vendored.length, manifest.docs.filter((d) => d.repo).length);
  assert.ok(vendored.length > 100, `only ${vendored.length} vendored pages`);
  for (const p of vendored) {
    assert.equal(p.source.url, `https://github.com/hugmesh/${p.source.repo}/blob/main/${p.source.path}`, p.route);
  }
});
