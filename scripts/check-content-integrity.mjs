#!/usr/bin/env node
/**
 * Verify the vendored `content/` tree against `content/.sync.lock.json`.
 *
 * NO NETWORK, NO SIBLING CHECKOUTS, NO CREDENTIAL. That is the entire point: it runs
 * on a bare Pages runner and still means something, unlike `sync-content --check`,
 * which compares against private repositories a CI job cannot reach and therefore
 * reports "unreachable" and exits 0 there.
 *
 * The two questions are genuinely different:
 *
 *   "Has somebody hand-edited a vendored document?"  <- LOCAL. This script. Blocking.
 *   "Has upstream moved on since we synced?"         <- needs the network. Advisory.
 *
 * The first is the one that corrupts the site: a hand-patched `content/*.md` desyncs
 * from its source, and the next `refresh:content` silently reverts the edit — or,
 * worse, the edit survives and the published page no longer matches the code it
 * claims to document.
 *
 * DESIGNED AGAINST "NOTHING TO CHECK". Every path below that could plausibly mean
 * "I could not verify this" is a FAILURE, not a skip:
 *
 *   - a vendored file with no lock entry          -> fail
 *   - a lock entry with no file                   -> fail
 *   - a lock entry whose recorded source no       -> fail
 *     longer matches the manifest's { repo, path }
 *   - a file under content/ that is neither       -> fail
 *     vendored nor declared authored:"site"
 *   - a missing or unparseable lock               -> fail
 *   - a lock that covers zero documents           -> fail
 *
 * A gate that can report "nothing to check" and still exit 0 is not a gate.
 * The single deliberate exception is check 5 when its private denylist file is
 * absent (see loadDenylist): it then prints a loud WARNING, because the file can
 * never exist on a public runner.
 *
 * PROVENANCE IS PART OF INTEGRITY. A sha256 alone only answers "is this file the
 * bytes we synced?" — it says nothing about WHERE those bytes came from. Repointing
 * a manifest entry at a different repo or path without re-vendoring leaves the sha
 * matching, so the old check passed while the rendered page's "generated from ..."
 * line — which is read from the manifest, not the lock — attributed the text to a
 * source it was never taken from. The manifest is the site's publication allowlist,
 * so a silently false attribution is exactly the failure this repo exists to prevent.
 */
import { readFile, readdir, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { homedir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadManifest } from './lib/manifest.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LOCK = path.join(ROOT, 'content', '.sync.lock.json');
const CONTENT = path.join(ROOT, 'content');

const sha256 = (text) => createHash('sha256').update(text, 'utf8').digest('hex');

/**
 * Check 5 reads its denylist from a file OUTSIDE this repository, never from the tree.
 * An earlier version kept sha256 hashes of the words here; an unsalted hash of a
 * dictionary word is reversed in under a second from a word list, so that published
 * the very words it was meant to keep out. Any committed form of a short word (hash,
 * salted hash, encoding) has the same flaw, so the words live only on the machines
 * that run a re-sync.
 *
 * File: $HUGMESH_PRIVATE_DENYLIST_FILE, else ~/.config/hugmesh/private-denylist.txt.
 * One word or phrase per line, matched case-insensitively anywhere in the text (so
 * glued or CamelCase forms are caught too). Blank lines and lines starting with # are
 * ignored.
 *
 * THE ONE DELIBERATE SKIP in this script: when no file exists at the default path,
 * check 5 prints a WARNING and is skipped, because a public CI runner and a stranger's
 * clone can never have the file, and failing there would only break every build. If
 * the variable is set but names a missing or empty file, that is a misconfiguration
 * and FAILS. Failure messages name the denylist line number, never the word, so a CI
 * log does not publish it either.
 */
const DENYLIST_ENV = 'HUGMESH_PRIVATE_DENYLIST_FILE';
const DEFAULT_DENYLIST = path.join(homedir(), '.config', 'hugmesh', 'private-denylist.txt');

async function loadDenylist() {
  const explicit = process.env[DENYLIST_ENV];
  const file = explicit || DEFAULT_DENYLIST;
  let raw;
  try {
    raw = await readFile(file, 'utf8');
  } catch (err) {
    if (err.code !== 'ENOENT' || explicit) {
      return { error: `${DENYLIST_ENV}=${file}: cannot read the private denylist (${err.code ?? err.message})` };
    }
    return { skipped: file };
  }
  const entries = [];
  raw.split(/\r?\n/).forEach((line, i) => {
    const word = line.trim().toLowerCase();
    if (word && !word.startsWith('#')) entries.push({ word, line: i + 1 });
  });
  if (!entries.length) {
    return { error: `${file}: the private denylist has no entries; a check with nothing to look for is not a check` };
  }
  return { entries };
}

/** Every .md under content/, as repo-relative POSIX paths. */
async function walk(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await walk(full)));
    else if (entry.isFile() && entry.name.endsWith('.md')) {
      out.push(path.relative(ROOT, full).split(path.sep).join('/'));
    }
  }
  return out;
}

async function main() {
  const failures = [];

  let lock;
  try {
    lock = JSON.parse(await readFile(LOCK, 'utf8'));
  } catch (err) {
    console.error(
      `content/.sync.lock.json is missing or unreadable (${err.code ?? err.message}).\n` +
        'Run a full `npm run refresh:content` to write it. Without the lock there is no\n' +
        'way to tell a vendored document from a hand-edited one, so this is a failure\n' +
        'rather than a skip.',
    );
    process.exit(1);
  }

  const locked = new Map((lock.docs ?? []).map((d) => [d.path, d]));
  if (locked.size === 0) {
    console.error('content/.sync.lock.json covers zero documents — refusing to pass vacuously.');
    process.exit(1);
  }

  const { docs } = await loadManifest(ROOT);
  const authored = new Set(docs.filter((d) => d.authored).map((d) => d.contentPath));
  const vendored = new Set(docs.filter((d) => d.repo).map((d) => d.contentPath));
  const byContentPath = new Map(docs.filter((d) => d.repo).map((d) => [d.contentPath, d]));

  const onDisk = new Set(await walk(CONTENT));

  // 1. Every vendored document must be locked, present, and unmodified.
  for (const rel of vendored) {
    const record = locked.get(rel);
    if (!record) {
      failures.push(`${rel}: vendored, but has NO lock entry (run a full refresh:content)`);
      continue;
    }
    if (!onDisk.has(rel)) {
      failures.push(`${rel}: locked, but the file is missing`);
      continue;
    }
    const entry = byContentPath.get(rel);
    if (record.sourceRepo !== entry.repo || record.sourcePath !== entry.path) {
      failures.push(
        `${rel}: PROVENANCE MISMATCH — docs.manifest.json and the lock disagree about the source\n` +
          `    manifest says ${entry.repo}/${entry.path}\n` +
          `    lock says     ${record.sourceRepo}/${record.sourcePath}\n` +
          '    The published page credits the MANIFEST, so this file is attributed to a\n' +
          '    source it was not vendored from. Re-run `npm run refresh:content` so the\n' +
          '    bytes and the attribution come from the same place.',
      );
      // No `continue`: the sha check below is independent of provenance, and a file
      // that was both repointed and hand-edited must report both problems.
    }
    const actual = sha256(await readFile(path.join(ROOT, rel), 'utf8'));
    if (actual !== record.sha256) {
      failures.push(
        `${rel}: MODIFIED since it was synced from ${record.sourceRepo}/${record.sourcePath}\n` +
          `    expected sha256 ${record.sha256}\n` +
          `    actual   sha256 ${actual}\n` +
          '    Vendored content is a projection of the source repository. Edit it THERE,\n' +
          '    then re-run `npm run refresh:content` — an edit here is reverted by the\n' +
          '    next sync, or silently outlives the text it claims to document.',
      );
    }
  }

  // 2. A lock entry whose document has left the manifest is stale.
  for (const rel of locked.keys()) {
    if (!vendored.has(rel)) {
      failures.push(`${rel}: locked, but no longer listed in docs.manifest.json (stale lock entry)`);
    }
  }

  // 3. Nothing may sit under content/ that is neither vendored nor site-authored.
  for (const rel of onDisk) {
    if (!vendored.has(rel) && !authored.has(rel)) {
      failures.push(
        `${rel}: present under content/ but not in docs.manifest.json.\n` +
          '    Every published page is opt-in; an unlisted file is either an accident or\n' +
          '    an attempt to publish something nobody reviewed.',
      );
    }
  }

  // 4. Every site-authored page the manifest promises must actually exist.
  for (const rel of authored) {
    if (!onDisk.has(rel)) {
      failures.push(`${rel}: declared authored:"site" in the manifest, but the file is missing`);
    }
  }

  // 5. Nothing published may carry a word on the private denylist. This site is
  // public and vendors text from many repositories, so a re-sync can bring back a
  // name that must not be published (a private deployment name, a personal
  // address). The words come from a local file, never from this repository: see
  // loadDenylist() above for why, and for the one case where this check is skipped.
  const denylist = await loadDenylist();
  if (denylist.error) {
    failures.push(denylist.error);
  } else if (denylist.entries) {
    for (const rel of [...onDisk, 'docs.manifest.json']) {
      const text = (await readFile(path.join(ROOT, rel), 'utf8')).toLowerCase();
      for (const { word, line } of denylist.entries) {
        if (text.includes(word)) {
          failures.push(
            `${rel}: contains private denylist entry on line ${line} of the denylist file.\n` +
              '    Remove it at the SOURCE repository and re-sync, or withhold the document\n' +
              '    from docs.manifest.json. Never hand-edit a vendored file.',
          );
        }
      }
    }
  }

  const checked = vendored.size + authored.size;
  if (failures.length) {
    console.error(`\ncontent integrity: ${failures.length} problem(s) across ${checked} documents\n`);
    for (const f of failures) console.error(`  ${f}`);
    console.error('');
    process.exit(1);
  }

  const age = lock.syncedAt
    ? Math.floor((Date.now() - Date.parse(lock.syncedAt)) / 86_400_000)
    : null;
  if (denylist.skipped) {
    console.warn(
      `WARNING: check 5 (private denylist) SKIPPED: no file at ${denylist.skipped} and ${DENYLIST_ENV} is unset.\n` +
        '         Pages were NOT checked for private words on this machine. Create that file\n' +
        '         before any refresh:content (see docs/withheld-before-going-public.md).',
    );
  }
  console.log(
    `content integrity OK — ${vendored.size} vendored + ${authored.size} authored documents verified` +
      (age === null ? '' : `; last full sync ${age} day(s) ago`) +
      (denylist.entries ? `; private denylist: ${denylist.entries.length} entr${denylist.entries.length === 1 ? 'y' : 'ies'} checked` : ''),
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
