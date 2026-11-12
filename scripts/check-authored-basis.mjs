#!/usr/bin/env node
/**
 * Have the upstream files behind a site-written page changed since the page was
 * last checked against them? See scripts/lib/basis.mjs for the model.
 *
 *   node scripts/check-authored-basis.mjs                 # compare with GitHub
 *   node scripts/check-authored-basis.mjs --workspace ..  # compare with checkouts
 *   node scripts/check-authored-basis.mjs --strict        # exit 1 when a file moved
 *   node scripts/check-authored-basis.mjs --stamp --workspace <dir> [--only section/slug]
 *
 * CHECK (the default) reads each recorded file as it is upstream today and compares
 * its sha256 with the recorded one. It prints three counts: unchanged, moved and
 * unreachable. A moved file is a WARNING, because it means "re-read this page", not
 * "the build is broken"; --strict turns it into exit 1. If not one file could be
 * read, the run exits 2: a check that looked at nothing has not passed.
 *
 * Sources: with --workspace <dir>, `<dir>/<repo>` must be a git checkout and the
 * file is read from its HEAD commit (never the working tree, so an uncommitted
 * edit cannot pass for upstream). Without it, the file is fetched from GitHub's
 * default branch over HTTPS with no credential, which works because the code
 * repositories are public.
 *
 * STAMP records "this page was checked against these files at this commit". Run it
 * only after reading the page against the files: it is the maintainer's signature,
 * not a way to silence the warning. It needs --workspace, so the commit it records
 * is one that exists on disk.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadManifest } from './lib/manifest.mjs';
import { BASIS_LOCK_PATH, basisLockProblems, compareBasis, mergeBasisRecords, sha256 } from './lib/basis.mjs';

const run = promisify(execFile);
const ORG = 'hugmesh';

const argv = process.argv.slice(2);
const flag = (name) => argv.includes(`--${name}`);
const value = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i === -1 ? fallback : argv[i + 1];
};

const ROOT = path.resolve(value('root', path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')));
const WORKSPACE = value('workspace', null);
const STAMP = flag('stamp');
const STRICT = flag('strict');
const ONLY = value('only', null);

/** `git -C <workspace>/<repo> ...`, stdout as text. */
async function git(repo, args) {
  const { stdout } = await run('git', ['-C', path.join(path.resolve(WORKSPACE), repo), ...args], {
    maxBuffer: 64 * 1024 * 1024,
  });
  return stdout;
}

/** The file as committed at HEAD of the checkout, and that commit. */
async function readFromWorkspace({ repo, path: file }) {
  const ref = (await git(repo, ['rev-parse', 'HEAD'])).trim();
  const text = await git(repo, ['show', `HEAD:${file}`]);
  return { text, ref };
}

/** The file on the repository's default branch, fetched without a credential. */
async function readFromGitHub({ repo, path: file }) {
  const url = `https://raw.githubusercontent.com/${ORG}/${repo}/HEAD/${file.split('/').map(encodeURIComponent).join('/')}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${repo}/${file}`);
  return res.text();
}

async function readLock() {
  try {
    return JSON.parse(await readFile(path.join(ROOT, BASIS_LOCK_PATH), 'utf8'));
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    throw err;
  }
}

async function writeLock(pages) {
  const body = {
    _comment:
      'What each site-written page was last checked against: per upstream file, the commit and the ' +
      "file's sha256 at that commit. Written by scripts/check-authored-basis.mjs --stamp. " +
      'check:integrity requires a record for every basis the manifest declares; check:basis ' +
      'reports a page whose upstream file has changed since. Do not edit by hand.',
    pages,
  };
  await writeFile(path.join(ROOT, BASIS_LOCK_PATH), `${JSON.stringify(body, null, 2)}\n`, 'utf8');
}

async function stamp(docs) {
  if (!WORKSPACE) {
    console.error('--stamp needs --workspace <dir>: the commit it records must be one checked out on disk');
    return 2;
  }
  const targets = docs.filter(
    (d) => d.authored && d.basis?.length > 0 && (!ONLY || `${d.section}/${d.slug}` === ONLY),
  );
  if (ONLY && targets.length === 0) {
    console.error(`--only ${ONLY}: no site-written page with a basis by that name`);
    return 2;
  }
  const updates = [];
  for (const d of targets) {
    const sources = [];
    for (const s of d.basis) {
      let got;
      try {
        got = await readFromWorkspace(s);
      } catch (err) {
        console.error(`${d.contentPath}: cannot read ${s.repo}/${s.path} at HEAD of ${path.join(WORKSPACE, s.repo)}: ${String(err.stderr || err.message).trim().split('\n')[0]}`);
        return 1;
      }
      sources.push({ repo: s.repo, path: s.path, ref: got.ref, sha256: sha256(got.text) });
    }
    updates.push({ page: d.contentPath, sources });
    console.log(`  stamp ${d.contentPath}  <- ${sources.map((s) => `${s.repo}/${s.path}@${s.ref.slice(0, 7)}`).join(', ')}`);
  }
  const current = (await readLock())?.pages ?? [];
  // A stamp of one page keeps every other page's record, as sync-content --only does.
  const kept = ONLY ? current : current.filter((p) => docs.some((d) => d.contentPath === p.page && d.basis?.length > 0));
  await writeLock(mergeBasisRecords(kept, updates));
  console.log(`\n${updates.length} page(s) stamped in ${BASIS_LOCK_PATH}`);
  return 0;
}

async function check(docs) {
  const lock = await readLock();
  const structural = basisLockProblems(docs, lock);
  if (structural.length) {
    console.error(`${structural.length} problem(s) with ${BASIS_LOCK_PATH}:\n`);
    for (const p of structural) console.error(`  ${p}`);
    return 1;
  }
  const pages = lock?.pages ?? [];
  const total = pages.reduce((n, p) => n + (p.sources?.length ?? 0), 0);
  if (total === 0) {
    console.error('no site-written page declares a basis, so there is nothing to compare: refusing to pass vacuously');
    return 2;
  }
  const readSource = WORKSPACE ? async (s) => (await readFromWorkspace(s)).text : readFromGitHub;
  const { unchanged, moved, unreachable } = await compareBasis(pages, readSource);

  const annotate = process.env.GITHUB_ACTIONS === 'true';
  for (const m of moved) {
    const line = `${m.page}: ${m.repo}/${m.path} has changed since ${m.ref.slice(0, 7)}; re-read the page against it, then re-stamp`;
    console.warn(annotate ? `::warning file=${m.page}::${line}` : `  MOVED  ${line}`);
  }
  for (const u of unreachable) {
    console.warn(`  UNREACHABLE  ${u.page}: ${u.repo}/${u.path} (${u.reason})`);
  }
  console.log(
    `\nsite-written pages against upstream (${WORKSPACE ? `checkouts in ${WORKSPACE}` : 'GitHub'}): ` +
      `${unchanged.length} unchanged, ${moved.length} moved, ${unreachable.length} unreachable, of ${total} recorded file(s)`,
  );
  if (unchanged.length + moved.length === 0) {
    console.error('not one upstream file could be read, so nothing was checked');
    return 2;
  }
  if (moved.length && STRICT) return 1;
  return 0;
}

async function main() {
  const { docs } = await loadManifest(ROOT);
  process.exitCode = STAMP ? await stamp(docs) : await check(docs);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
