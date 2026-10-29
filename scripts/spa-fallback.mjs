#!/usr/bin/env node
/**
 * Post-build step for GitHub Pages.
 *
 * Pages is a static file server with no rewrite rules, so a cold request for
 * /developer-guide/argocd-gitops has no file to serve and Pages answers with
 * 404.html. Copying index.html to 404.html turns that into the SPA fallback: the
 * app boots, the router reads the real path, and the reader never sees a 404.
 * The HTTP status is still 404, which is right for a genuinely missing page and
 * was WRONG for real ones: crawlers and link checkers believe the status, so
 * every page but the home page looked missing to them. Hence the next step.
 *
 * EVERY REAL ROUTE GETS ITS OWN FILE TOO (lib/static-pages.mjs): the standalone
 * pages, every section and every published document are written as
 * <route>/index.html and <route>.html with their own title, description and
 * canonical URL, so they are served with a 200 instead of through 404.html.
 * sitemap.xml is generated from the same list, and robots.txt when src/ has none. 404.html is then
 * only what an unknown path gets, which is what a 404 status should mean.
 *
 * Also writes .nojekyll. Without it Pages runs Jekyll over the output and drops
 * every path beginning with an underscore — which is exactly how Angular names
 * some emitted chunks.
 */
import { readFile, writeFile, copyFile, access, readdir, mkdir } from 'node:fs/promises';
import { filesForRoute, pageHtml, robotsTxt, routesFromIndex, sitemapXml } from './lib/static-pages.mjs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** The application builder emits into dist/browser; older configs emit into
 *  dist/ directly. Probe rather than assume, so a builder change fails loudly
 *  here instead of silently publishing a site with no SPA fallback. */
async function resolveOutDir() {
  for (const candidate of ['dist/browser', 'dist']) {
    const dir = path.join(ROOT, candidate);
    try {
      await access(path.join(dir, 'index.html'));
      return dir;
    } catch {
      /* try the next one */
    }
  }
  throw new Error('no index.html under dist/browser or dist — did the build run?');
}

const out = await resolveOutDir();

await copyFile(path.join(out, 'index.html'), path.join(out, '404.html'));
await writeFile(path.join(out, '.nojekyll'), '', 'utf8');

// CNAME is listed as an asset in angular.json, but assert it: losing it silently
// unbinds the custom domain on the next deploy, and the symptom (the site is
// suddenly at hugmesh.github.io) shows up long after the cause.
const cname = path.join(out, 'CNAME');
try {
  const domain = (await readFile(cname, 'utf8')).trim();
  console.log(`  CNAME       ${domain}`);
} catch {
  throw new Error(`${path.relative(ROOT, cname)} is missing — the custom domain would be dropped`);
}

// One file per route, robots.txt and sitemap.xml, all from the content index the
// app itself reads, so a page cannot be in the app and missing here or vice versa.
const origin = `https://${(await readFile(cname, 'utf8')).trim()}`;
const indexHtml = await readFile(path.join(out, 'index.html'), 'utf8');
const contentIndex = JSON.parse(await readFile(path.join(out, 'assets/content/index.json'), 'utf8'));
const routes = routesFromIndex(contentIndex);
for (const page of routes) {
  const html = pageHtml(indexHtml, page, origin);
  for (const rel of filesForRoute(page.route)) {
    const dest = path.join(out, rel);
    if (!dest.startsWith(out + path.sep)) throw new Error(`${rel} escapes ${out}`);
    await mkdir(path.dirname(dest), { recursive: true });
    await writeFile(dest, html, 'utf8');
  }
}
const lastmod = new Date().toISOString().slice(0, 10);
await writeFile(path.join(out, 'sitemap.xml'), sitemapXml(origin, routes, lastmod), 'utf8');
// robots.txt: a hand-written src/robots.txt (PR #33 adds one as an angular.json
// asset) wins; it must then point at the sitemap generated above. Only when the
// build has none is one written here, so the two can never both claim the file.
const robots = path.join(out, 'robots.txt');
let robotsNote;
try {
  const existing = await readFile(robots, 'utf8');
  if (!/^Sitemap:\s*\S+\/sitemap\.xml\s*$/m.test(existing)) {
    throw new Error('robots.txt from src/ has no "Sitemap: <origin>/sitemap.xml" line');
  }
  robotsNote = 'kept from src/';
} catch (e) {
  if (e?.code !== 'ENOENT') throw e;
  await writeFile(robots, robotsTxt(origin), 'utf8');
  robotsNote = 'written';
}

const files = await readdir(out, { recursive: true, withFileTypes: true });
console.log(`  routes      ${routes.length} pages written as <route>/index.html and <route>.html`);
console.log(`  sitemap.xml ${routes.length + 1} URLs · robots.txt ${robotsNote}`);
console.log(`  404.html    SPA fallback written`);
console.log(`  .nojekyll   written`);
console.log(`\n${files.filter((f) => f.isFile()).length} files in ${path.relative(ROOT, out)}`);
