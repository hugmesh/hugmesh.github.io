/**
 * The manifest's navigation, redirect and title rules (scripts/lib/manifest.mjs).
 *
 *   node --test scripts/manifest.test.mjs
 *
 * One passing fixture, then one failing fixture per rule, so a rule that stops
 * firing fails here instead of letting a bad title or a dangling redirect ship.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SECTIONS, lintSummary, lintTitle, loadManifest, validateManifest } from './lib/manifest.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** A minimal valid manifest: one page per tab, each tab with one group. */
function fixture() {
  const docs = SECTIONS.map((s) => ({
    section: s.id,
    slug: 'first',
    title: `First page of ${s.id}`,
    summary: `What the first page of ${s.id} is about.`,
    authored: 'site',
  }));
  const sections = Object.fromEntries(
    SECTIONS.map((s) => [s.id, { start: `/${s.id}/first`, groups: [{ id: 'main', title: 'Main', pages: [`/${s.id}/first`] }] }]),
  );
  return { meta: {}, sections, redirects: [], docs };
}
const ok = (m) => validateManifest(m);
const fails = (m, re) => assert.throws(() => validateManifest(m), re);

test('a valid manifest loads, and every page gets its nav home', () => {
  const m = ok(fixture());
  assert.equal(m.docs.length, SECTIONS.length);
  assert.deepEqual([m.docs[0].navSection, m.docs[0].navGroup], ['overview', 'main']);
  assert.deepEqual(m.sections.map((s) => s.id), SECTIONS.map((s) => s.id));
});

test('the real manifest loads', async () => {
  const m = await loadManifest(ROOT);
  assert.ok(m.docs.length > 100);
});

test('a page can be listed in another tab than its URL prefix (nav home)', () => {
  const f = fixture();
  f.sections.overview.groups[0].pages.push('/studio/first');
  f.sections.studio.groups = [{ id: 'main', title: 'Main', pages: ['/downloads'] }];
  f.sections.studio.start = null;
  const m = ok(f);
  assert.equal(m.docs.find((d) => d.route === '/studio/first').navSection, 'overview');
});

test('rule: every page is listed in a group', () => {
  const f = fixture();
  f.docs.push({ section: 'overview', slug: 'orphan', title: 'Orphan page', summary: 'Nobody lists it.', authored: 'site' });
  fails(f, /orphan: not listed in any group/);
});

test('rule: a page is listed once', () => {
  const f = fixture();
  f.sections.studio.groups[0].pages.push('/overview/first');
  fails(f, /already listed in overview\/main/);
});

test('rule: a listed route must exist', () => {
  const f = fixture();
  f.sections.overview.groups[0].pages.push('/overview/missing');
  fails(f, /"\/overview\/missing" is not a page this site serves/);
});

test('rule: a start route must exist', () => {
  const f = fixture();
  f.sections.overview.start = '/overview/nope';
  fails(f, /sections\.overview\.start/);
});

test('rule: every tab has at least one group', () => {
  const f = fixture();
  f.sections.games.groups = [];
  fails(f, /sections\.games: needs at least one group/);
  const g = fixture();
  delete g.sections.games;
  fails(g, /sections\.games: missing/);
});

test('rule: group ids are unique in a tab', () => {
  const f = fixture();
  f.sections.overview.groups.push({ id: 'main', title: 'Again', pages: ['/downloads'] });
  fails(f, /duplicate group id "main"/);
});

test('rule: entries may not carry order or group', () => {
  const f = fixture();
  f.docs[0].order = 3;
  fails(f, /"order" and "group" are gone/);
  const g = fixture();
  g.docs[0].group = 'Services';
  fails(g, /"order" and "group" are gone/);
});

test('rule: a redirect must start at a known section, not shadow a live page, and land on one', () => {
  const r = (from, to) => {
    const f = fixture();
    f.redirects = [{ from, to }];
    return f;
  };
  ok(r('/overview/old', '/overview/first'));
  ok(r('/overview/old', '/games'));
  fails(r('/nowhere/old', '/overview/first'), /known section/);
  fails(r('/overview/first', '/games/first'), /is a live page/);
  fails(r('/overview/old', '/overview/gone'), /target "\/overview\/gone" is not a page/);
});

test('rule: redirects do not chain and are not duplicated', () => {
  // A chain's middle hop is a retired URL, so it is never a live target: the
  // chain fails as a redirect to a page this site does not serve.
  const f = fixture();
  f.redirects = [
    { from: '/overview/a', to: '/overview/b' },
    { from: '/overview/b', to: '/overview/first' },
  ];
  fails(f, /not a page|chains/);
  const g = fixture();
  g.redirects = [
    { from: '/overview/a', to: '/overview/first' },
    { from: '/overview/a', to: '/games/first' },
  ];
  fails(g, /redirected twice/);
});

test('rule: titles are short names (each lint rule fires)', () => {
  const cases = [
    ['{{BRAND_TITLE}} host', /placeholder/],
    ['brands/ profiles', /slash/],
    ['Studio — the walkthrough', /dash/],
    ['Studio - the walkthrough', /dash/],
    ['The hugmesh-generator docs', /repository name/],
    ['hugmesh.net host shell', /domain/],
    ['image-builder', /slug/],
    ['First-run bootstrap (issue #49)', /ticket/],
    ['Docker mesh node (FD-09)', /ticket/],
    ['Superadmin client (v1)', /ticket/],
    ['Run the ENTIRE stack', /capitalised word "ENTIRE"/],
    ['FINDINGS', /capitalised word "FINDINGS"/],
    ['01 Overview', /leading number/],
    ['x'.repeat(61), /length 61/],
    ['ab', /length 2/],
  ];
  for (const [title, re] of cases) {
    assert.match(lintTitle(title).join('; '), re, title);
  }
  assert.deepEqual(lintTitle('Write the KEYS sticks for QEMU and WASM'), []);
  assert.deepEqual(lintTitle('012: Admin-only debug mode', 'decisions'), []);
  assert.match(lintTitle('012: Admin-only debug mode', 'guides').join(), /outside a "decisions" group/);
});

test('rule: a bad title fails the build with the page named', () => {
  const f = fixture();
  f.docs[0].title = 'RUNNING — build a fleet';
  fails(f, /\/overview\/first: title "RUNNING — build a fleet" has/);
});

test('rule: titles are unique across the site, ignoring case', () => {
  const f = fixture();
  f.docs[1].title = f.docs[0].title.toLowerCase();
  fails(f, /is already used by/);
});

test('rule: decision numbers are unique in their group', () => {
  const f = fixture();
  f.docs.push(
    { section: 'games', slug: 'd1', title: '001: One way', summary: 'The first record.', authored: 'site' },
    { section: 'games', slug: 'd2', title: '001: Another way', summary: 'The clashing record.', authored: 'site' },
  );
  f.sections.games.groups.push({ id: 'decisions', title: 'Decisions', pages: ['/games/d1', '/games/d2'] });
  fails(f, /decision number 001 is also used/);
});

test('rule: summaries are one short line, and not the title again', () => {
  assert.deepEqual(lintSummary('Cap the CPU a build may use.', 'Resource limits'), []);
  assert.match(lintSummary('', 'T').join(), /no summary/);
  assert.match(lintSummary('x'.repeat(161), 'T').join(), /length 161/);
  assert.match(lintSummary('Made by {{BRAND}}', 'T').join(), /placeholder/);
  assert.match(lintSummary('Brand profiles', 'Brand profiles').join(), /same text as the title/);
  const f = fixture();
  f.docs[0].summary = f.docs[0].title;
  fails(f, /summary has the same text as the title/);
});

test('every tab has an intro file', async () => {
  for (const s of SECTIONS) {
    const text = await readFile(path.join(ROOT, 'landings', `${s.id}.md`), 'utf8');
    assert.ok(text.trim().length > 40, `landings/${s.id}.md is empty`);
  }
});
