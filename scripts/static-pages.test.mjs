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
    ['/downloads', '/search', '/tutorials', '/tutorials/start-here'],
  );
});

test('each route is written as <route>/index.html and <route>.html', () => {
  assert.deepEqual(filesForRoute('/tutorials/start-here'), ['tutorials/start-here/index.html', 'tutorials/start-here.html']);
});

test('a page carries its own title, description, canonical and og tags, escaped', () => {
  const [, , , doc] = routesFromIndex(index);
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
    'https://docs.example/search/',
    'https://docs.example/tutorials/',
    'https://docs.example/tutorials/start-here/',
  ]);
  assert.equal(canonicalUrl(ORIGIN, '/'), 'https://docs.example/');
  assert.equal(robotsTxt(ORIGIN), 'User-agent: *\nAllow: /\n\nSitemap: https://docs.example/sitemap.xml\n');
});
