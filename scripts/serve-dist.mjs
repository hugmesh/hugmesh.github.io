#!/usr/bin/env node
/**
 * Preview the BUILT site with GitHub Pages' serving semantics.
 *
 * `ng serve` cannot show you this: it has its own SPA fallback and rewrites any
 * unknown path to index.html with a 200. Pages does something different — it
 * serves the file if one exists, and otherwise returns 404.html with a real 404
 * status. That difference is exactly where a deep link breaks in production and
 * works locally, so the preview server has to reproduce it rather than be
 * friendlier than the real thing.
 *
 *   node scripts/serve-dist.mjs [--port 8899] [--dir dist/browser]
 */
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i === -1 ? fallback : argv[i + 1];
};

const DIR = path.resolve(ROOT, arg('dir', 'dist/browser'));
const PORT = Number(arg('port', '8899'));

const TYPES = new Map(
  Object.entries({
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.mjs': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.webp': 'image/webp',
    '.woff2': 'font/woff2',
    '.ttf': 'font/ttf',
    '.map': 'application/json; charset=utf-8',
    '.txt': 'text/plain; charset=utf-8',
  }),
);

async function readIfFile(p) {
  try {
    const s = await stat(p);
    if (!s.isFile()) return null;
    return await readFile(p);
  } catch {
    return null;
  }
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost');
  // Resolve inside DIR and reject anything that escapes it — a preview server
  // still runs on a machine with the rest of the filesystem on it.
  const rel = path.normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, '');
  const target = path.join(DIR, rel);
  if (!target.startsWith(DIR)) {
    res.writeHead(403).end('forbidden');
    return;
  }

  let body = await readIfFile(target);
  let file = target;

  // Directory request -> its index.html, matching Pages.
  if (!body && !path.extname(target)) {
    file = path.join(target, 'index.html');
    body = await readIfFile(file);
  }

  if (body) {
    res.writeHead(200, { 'content-type': TYPES.get(path.extname(file)) ?? 'application/octet-stream' });
    res.end(body);
    return;
  }

  // THE POINT OF THIS SERVER: unknown path -> 404.html, with a 404 status.
  const fallback = await readIfFile(path.join(DIR, '404.html'));
  if (fallback) {
    res.writeHead(404, { 'content-type': 'text/html; charset=utf-8' });
    res.end(fallback);
    return;
  }
  res.writeHead(404).end('not found (and no 404.html — did postbuild run?)');
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`serving ${path.relative(ROOT, DIR)} with GitHub Pages semantics`);
  console.log(`  http://127.0.0.1:${PORT}/`);
});
