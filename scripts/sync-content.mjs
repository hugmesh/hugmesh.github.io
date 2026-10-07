#!/usr/bin/env node
/**
 * Refresh `content/` from the code repos named in docs.manifest.json.
 *
 * This is a MAINTAINER tool, not a build step. The site build (build-content.mjs)
 * reads only the committed `content/` tree, so a Pages build needs no access to
 * any other repository — which matters because every hugmesh-* code repo is
 * PRIVATE, and so is this one (decisions 115a/115b).
 *
 * Sources, in order of preference:
 *   1. a sibling checkout   ../<repo>/<path>          (default; --workspace to move it)
 *   2. GitHub, via `gh`     gh api repos/<org>/<repo>/contents/<path>   (--from-github)
 *
 * Usage:
 *   node scripts/sync-content.mjs                # refresh from ../<repo>
 *   node scripts/sync-content.mjs --check        # exit 1 if anything is stale
 *   node scripts/sync-content.mjs --from-github  # refresh via the gh CLI
 *   node scripts/sync-content.mjs --only developer-guide/argocd-gitops
 */
import { readFile, writeFile, mkdir, access } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadManifest } from './lib/manifest.mjs';
import { parseFrontMatter, formatFrontMatter } from './lib/frontmatter.mjs';

const run = promisify(execFile);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ORG = 'hugmesh';

/** The integrity record, written beside the content it describes. See
 *  scripts/check-content-integrity.mjs for what reads it and why. */
export const LOCK_PATH = path.join('content', '.sync.lock.json');

const sha256 = (text) => createHash('sha256').update(text, 'utf8').digest('hex');

const argv = process.argv.slice(2);
const flag = (name) => argv.includes(`--${name}`);
const value = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i === -1 ? fallback : argv[i + 1];
};

const CHECK = flag('check');
const FROM_GITHUB = flag('from-github');
const WORKSPACE = path.resolve(ROOT, value('workspace', '..'));
const ONLY = value('only', null);

const exists = (p) => access(p).then(() => true, () => false);

/** Read one doc's upstream source. Returns { text, ref } or null when the source
 *  cannot be reached — a missing sibling checkout is a normal condition, not a
 *  crash, because nobody clones all 38 repos to fix one typo. */
async function readSource(entry) {
  if (FROM_GITHUB) {
    // `gh` is invoked WITHOUT the ambient fine-grained GH_TOKEN: it 404s on these
    // private repos, while the keyring credential resolves them. Same reason the
    // repo's own docs tell you to prefix git with `env -u GH_TOKEN`.
    const env = { ...process.env };
    delete env.GH_TOKEN;
    delete env.GITHUB_TOKEN;
    try {
      const { stdout } = await run(
        'gh',
        ['api', `repos/${ORG}/${entry.repo}/contents/${entry.path}`, '--jq', '.content'],
        { env, maxBuffer: 64 * 1024 * 1024 },
      );
      return { text: Buffer.from(stdout.trim(), 'base64').toString('utf8'), ref: `${ORG}/${entry.repo}@HEAD` };
    } catch (err) {
      return { error: `gh api failed: ${String(err.stderr || err.message).trim().split('\n')[0]}` };
    }
  }

  const file = path.join(WORKSPACE, entry.repo, entry.path);
  if (!(await exists(file))) {
    return { error: `no sibling checkout at ${path.relative(ROOT, file)}` };
  }
  let ref = 'working tree';
  try {
    const { stdout } = await run('git', ['-C', path.join(WORKSPACE, entry.repo), 'rev-parse', '--short', 'HEAD']);
    ref = stdout.trim();
  } catch {
    /* a checkout without git metadata still has readable files */
  }
  return { text: await readFile(file, 'utf8'), ref };
}

/**
 * Strip the parts of an upstream README/doc that only make sense inside its repo:
 * a leading H1 (the site renders `title` from the manifest as the page heading,
 * so keeping it would print the title twice) and any HTML comment.
 */
function normaliseBody(text) {
  let body = text.replace(/^﻿/, '').trimStart();
  body = body.replace(/^#\s+.*\r?\n+/, '');
  return `${body.trimEnd()}\n`;
}

/** Merge new records into the lock, preserving order and stamping the sync time. */
async function writeLock(entries) {
  const dest = path.join(ROOT, LOCK_PATH);
  const body = {
    // A human reading a diff of this file needs to know what it is for.
    _comment:
      'Integrity record for the vendored content/ tree, written by scripts/sync-content.mjs. ' +
      'scripts/check-content-integrity.mjs verifies every file against it WITHOUT network ' +
      'access, which is what makes hand-editing a vendored document a build failure rather ' +
      'than silent drift. Do not edit by hand.',
    syncedAt: new Date().toISOString(),
    docs: entries.sort((a, b) => a.path.localeCompare(b.path)),
  };
  await writeFile(dest, `${JSON.stringify(body, null, 2)}\n`, 'utf8');
}

async function main() {
  const { docs } = await loadManifest(ROOT);
  const targets = docs.filter(
    (d) => d.repo && d.path && (!ONLY || `${d.section}/${d.slug}` === ONLY),
  );

  if (ONLY && targets.length === 0) {
    console.error(`--only ${ONLY}: no such vendored doc in docs.manifest.json`);
    process.exit(2);
  }

  const changed = [];
  const failed = [];
  const lockEntries = [];
  let unchanged = 0;

  for (const entry of targets) {
    const source = await readSource(entry);
    if (source.error) {
      failed.push({ entry, reason: source.error });
      continue;
    }

    const front = formatFrontMatter({
      title: entry.title,
      section: entry.section,
      slug: entry.slug,
      summary: entry.summary,
      source_repo: entry.repo,
      source_path: entry.path,
      source_ref: source.ref,
    });
    const next = `${front}\n${normaliseBody(source.text)}`;

    const dest = path.join(ROOT, entry.contentPath);
    const previous = (await exists(dest)) ? await readFile(dest, 'utf8') : null;

    // Compare BODIES, not whole files: source_ref changes on every upstream
    // commit even when the prose is identical, and treating that as a change
    // would make --check fail forever and every sync produce a noisy diff.
    const sameBody =
      previous !== null && parseFrontMatter(previous).body === parseFrontMatter(next).body;

    // The lock records what the file SHOULD hash to. Recorded for unchanged files
    // too, or a partial sync would silently drop their entries and the integrity
    // check would then have nothing to check them against.
    const finalText = sameBody ? previous : next;
    lockEntries.push({
      path: entry.contentPath,
      sourceRepo: entry.repo,
      sourcePath: entry.path,
      sourceRef: source.ref,
      sha256: sha256(finalText),
    });

    if (sameBody) {
      unchanged += 1;
      continue;
    }

    changed.push(entry);
    if (!CHECK) {
      await mkdir(path.dirname(dest), { recursive: true });
      await writeFile(dest, next, 'utf8');
    }
  }

  // Only a FULL, fully-successful sync may rewrite the lock. A --only run or a run
  // with unreachable sources knows about a subset, and letting it write would delete
  // the records for everything it did not look at — turning the integrity check into
  // a check of whatever was synced last.
  if (!CHECK && !ONLY && failed.length === 0 && lockEntries.length === targets.length) {
    await writeLock(lockEntries);
    console.log(`  lock   ${LOCK_PATH}  (${lockEntries.length} entries)`);
  } else if (!CHECK) {
    console.log(
      `\n  lock   NOT rewritten — a partial or incomplete sync must not narrow it.` +
        `\n         Run a full \`npm run refresh:content\` with every source reachable.`,
    );
  }

  for (const { entry, reason } of failed) {
    console.warn(`  skip  ${entry.section}/${entry.slug} — ${reason}`);
  }
  for (const entry of changed) {
    console.log(`  ${CHECK ? 'stale' : 'write'} ${entry.contentPath}  <- ${entry.repo}/${entry.path}`);
  }
  console.log(
    `\n${targets.length} vendored docs: ${changed.length} ${CHECK ? 'stale' : 'written'}, ` +
      `${unchanged} unchanged, ${failed.length} unreachable`,
  );

  if (CHECK && changed.length > 0) {
    console.error('\ncontent/ is behind its sources. Run: npm run refresh:content');
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
