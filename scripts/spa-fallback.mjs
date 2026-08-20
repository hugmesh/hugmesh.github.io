#!/usr/bin/env node
/**
 * Post-build step for GitHub Pages.
 *
 * Pages is a static file server with no rewrite rules, so a cold request for
 * /developer-guide/argocd-gitops has no file to serve and Pages answers with
 * 404.html. Copying index.html to 404.html turns that into the SPA fallback: the
 * app boots, the router reads the real path, and the reader never sees a 404.
 * The HTTP status is still 404 — which is correct for a genuinely missing page
 * and harmless for a real one, since crawlers follow the site's own links rather
 * than guessing URLs.
 *
 * Also writes .nojekyll. Without it Pages runs Jekyll over the output and drops
 * every path beginning with an underscore — which is exactly how Angular names
 * some emitted chunks.
 */
import { readFile, writeFile, copyFile, access, readdir } from 'node:fs/promises';
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

const files = await readdir(out, { recursive: true, withFileTypes: true });
console.log(`  404.html    SPA fallback written`);
console.log(`  .nojekyll   written`);
console.log(`\n${files.filter((f) => f.isFile()).length} files in ${path.relative(ROOT, out)}`);
