/**
 * The per-route pages, robots.txt and sitemap.xml (scripts/lib/static-pages.mjs).
 *
 *   node --test scripts/static-pages.test.mjs
 *
 * Runs against the real src/index.html, so a change to its head that would make
 * every generated page claim to be the home page fails here, not in production.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  canonicalUrl,
  filesForRoute,
  pageHtml,
  redirectHtml,
  redirectsFromIndex,
  robotsTxt,
  routesFromIndex,
  sitemapXml,
} from './lib/static-pages.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const indexHtml = await readFile(path.join(ROOT, 'src/index.html'), 'utf8');
const ORIGIN = 'https://docs.example';
const index = {
  sections: [
    {
      id: 'tutorials',
      title: 'Tutorials',
      blurb: 'Step by step.',
      docs: [{ route: '/tutorials/start-here', title: 'Start here', summary: 'An ordered "path" <first>.' }],
    },
  ],
};

test('every standalone page, section and document gets a route', () => {
  assert.deepEqual(
    routesFromIndex(index).map((r) => r.route),
    ['/downloads', '/board', '/search', '/tutorials', '/tutorials/start-here'],
  );
});

test('each route is written as <route>/index.html and <route>.html', () => {
  assert.deepEqual(filesForRoute('/tutorials/start-here'), ['tutorials/start-here/index.html', 'tutorials/start-here.html']);
});

test('a page carries its own title, description, canonical and og tags, escaped', () => {
  const doc = routesFromIndex(index).find((r) => r.route === '/tutorials/start-here');
  const html = pageHtml(indexHtml, doc, ORIGIN);
  assert.match(html, /<title>Start here — HugMesh Documentation<\/title>/);
  assert.match(html, /<meta name="description" content="An ordered &quot;path&quot; &lt;first&gt;\." \/>/);
  assert.match(html, /<link rel="canonical" href="https:\/\/docs\.example\/tutorials\/start-here\/" \/>/);
  assert.match(html, /<meta property="og:url" content="https:\/\/docs\.example\/tutorials\/start-here\/" \/>/);
  assert.match(html, /<meta property="og:title" content="Start here — HugMesh Documentation" \/>/);
  assert.equal((html.match(/rel="canonical"/g) ?? []).length, 1);
  assert.doesNotMatch(html, /<title>HugMesh Documentation<\/title>/, 'the home page title must be gone');
  // Everything else is index.html unchanged: the app still boots from it.
  assert.ok(html.includes('<hug-root></hug-root>'));
  assert.ok(html.includes('<base href="/" />'));
});

test('the head as the Angular build re-serialises it (content="…"/> on one line) is rewritten too', () => {
  const built = indexHtml
    .replace(/\s*\n\s*/g, ' ')
    .replace(/"\s+\/>/g, '"/>');
  assert.match(built, /<meta property="og:title" content="HugMesh Documentation"\/>/, 'the fixture really is the built shape');
  const doc = routesFromIndex(index).find((r) => r.route === '/tutorials/start-here');
  const html = pageHtml(built, doc, ORIGIN);
  assert.match(html, /<link rel="canonical" href="https:\/\/docs\.example\/tutorials\/start-here\/" \/>/);
  assert.match(html, /<meta property="og:title" content="Start here — HugMesh Documentation" \/>/);
  assert.match(html, /<meta name="description" content="An ordered &quot;path&quot; &lt;first&gt;\." \/>/);
});

test('a head that no longer has the expected tags fails loudly instead of writing copies of the home page', () => {
  const [page] = routesFromIndex(index);
  assert.throws(() => pageHtml(indexHtml.replace(/<link rel="canonical"[^>]*>/, ''), page, ORIGIN), /canonical/);
});

test('unsafe or duplicate routes are refused', () => {
  assert.throws(() => routesFromIndex({ sections: [{ id: '../x', title: 'X', docs: [] }] }), /refusing/);
  assert.throws(
    () => routesFromIndex({ sections: [{ id: 'downloads', title: 'Downloads', docs: [] }] }),
    /listed twice/,
  );
});

test('sitemap lists the home page and every route at its canonical URL; robots points at it', () => {
  const xml = sitemapXml(ORIGIN, routesFromIndex(index), '2026-10-22');
  assert.match(xml, /^<\?xml version="1.0" encoding="UTF-8"\?>/);
  const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  assert.deepEqual(locs, [
    'https://docs.example/',
    'https://docs.example/downloads/',
    'https://docs.example/board/',
    'https://docs.example/search/',
    'https://docs.example/tutorials/',
    'https://docs.example/tutorials/start-here/',
  ]);
  assert.equal(canonicalUrl(ORIGIN, '/'), 'https://docs.example/');
  assert.equal(robotsTxt(ORIGIN), 'User-agent: *\nAllow: /\n\nSitemap: https://docs.example/sitemap.xml\n');
});

test('a retired URL gets a redirect page: refresh, canonical to the target, noindex, a visible link', () => {
  const html = redirectHtml(ORIGIN, '/tutorials/old-page', '/studio/overview');
  assert.match(html, /<meta http-equiv="refresh" content="0; url=\/studio\/overview\/" \/>/);
  assert.match(html, /<link rel="canonical" href="https:\/\/docs\.example\/studio\/overview\/" \/>/);
  assert.match(html, /<meta name="robots" content="noindex" \/>/);
  assert.match(html, /This page moved to <a href="\/studio\/overview\/">\/studio\/overview<\/a>/);
  // A redirect to a section index, and one that keeps a heading anchor.
  assert.match(redirectHtml(ORIGIN, '/games/old', '/games'), /url=\/games\/"/);
  assert.match(redirectHtml(ORIGIN, '/a/b', '/c/d#e'), /url=\/c\/d\/#e"/);
  assert.doesNotMatch(html, /<hug-root>/, 'a redirect page does not boot the app');
});

test('redirects come from the index, are checked, and never reach the sitemap', () => {
  const withRedirects = { ...index, redirects: { '/tutorials/old-page': '/tutorials/start-here' } };
  assert.deepEqual(redirectsFromIndex(withRedirects), [{ from: '/tutorials/old-page', to: '/tutorials/start-here' }]);
  assert.deepEqual(redirectsFromIndex(index), []);
  assert.throws(() => redirectsFromIndex({ redirects: { '/../etc': '/x' } }), /refusing/);
  assert.throws(() => redirectsFromIndex({ redirects: { '/a/b': 'https://elsewhere.example/' } }), /refusing/);
  const xml = sitemapXml(ORIGIN, routesFromIndex(withRedirects), '2026-11-11');
  assert.doesNotMatch(xml, /old-page/);
  assert.deepEqual(filesForRoute('/tutorials/old-page'), ['tutorials/old-page/index.html', 'tutorials/old-page.html']);
});
