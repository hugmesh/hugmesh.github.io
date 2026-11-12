/**
 * What a site-written page was checked against.
 *
 * A vendored page is a copy, so `content/.sync.lock.json` can prove it still matches
 * its source. A page written here (authored:"site") is a summary of files in other
 * repositories, and nothing ties it to them: the upstream README changes, the page
 * keeps saying what was true the day it was written, and no check notices.
 *
 * So every site-written page declares, in docs.manifest.json, the upstream files
 * its facts were taken from:
 *
 *   "basis": [{ "repo": "hugmesh-actions", "path": "README.md" }]
 *
 * and `content/.basis.lock.json` records, per page and file, the commit it was
 * checked at and the sha256 of the file at that commit. Two checks read it:
 *
 *   check:integrity  (offline, blocking)  every declared file has a lock record,
 *                                         and no record is left over.
 *   check:basis      (network, advisory)  the file as it is upstream today still
 *                                         has the recorded sha256. If not, the page
 *                                         is listed as due a re-check.
 *
 * The comparison is by content, not by commit: a repository's main moves on every
 * merge, and a check that warned each time would be ignored within a week.
 *
 * `basis: []` is allowed and means "no upstream file to track". It has to be
 * written out, so leaving a page untracked is a visible choice in the manifest.
 */
import { createHash } from 'node:crypto';
import path from 'node:path';

export const BASIS_LOCK_PATH = path.join('content', '.basis.lock.json');

export const sha256 = (text) => createHash('sha256').update(text, 'utf8').digest('hex');

const REPO_RE = /^(?:hugmesh-[a-z0-9]+(?:-[a-z0-9]+)*|\.github)$/;
const SHA1_RE = /^[0-9a-f]{40}$/;
const SHA256_RE = /^[0-9a-f]{64}$/;

const key = (s) => `${s.repo}/${s.path}`;

/**
 * Why a manifest entry's `basis` is not usable, or [] when it is. Only the shape is
 * checked here; whether the lock agrees is basisLockProblems' job.
 */
export function basisDeclProblems(entry) {
  const problems = [];
  if (!entry.authored) {
    if ('basis' in entry) problems.push('"basis" is for site-written pages; a vendored page is tracked by the sync lock');
    return problems;
  }
  if (!Array.isArray(entry.basis)) {
    problems.push(
      'a site-written page needs "basis": the upstream files its facts come from, ' +
        'as [{ repo, path }], or [] when there is no file to track',
    );
    return problems;
  }
  const seen = new Set();
  for (const [i, s] of entry.basis.entries()) {
    const where = `basis[${i}]`;
    if (!s || typeof s !== 'object') {
      problems.push(`${where}: expected { repo, path }`);
      continue;
    }
    if (!REPO_RE.test(s.repo ?? '')) problems.push(`${where}: "${s.repo}" is not a hugmesh repository name`);
    const p = String(s.path ?? '');
    if (!p || p.startsWith('/') || p.split('/').includes('..') || p.includes('\\')) {
      problems.push(`${where}: path must be a file inside the repository, got "${s.path}"`);
    }
    if (seen.has(key(s))) problems.push(`${where}: ${key(s)} is listed twice`);
    seen.add(key(s));
  }
  return problems;
}

/**
 * The offline half: does the lock cover exactly what the manifest declares?
 * `docs` are normalised manifest entries; `lock` is the parsed lock file, or null
 * when it is missing. Returns one message per problem.
 */
export function basisLockProblems(docs, lock) {
  const problems = [];
  const tracked = docs.filter((d) => d.authored && Array.isArray(d.basis) && d.basis.length > 0);
  if (tracked.length === 0) return problems;
  if (!lock || !Array.isArray(lock.pages)) {
    return [`${BASIS_LOCK_PATH}: missing or unreadable, but ${tracked.length} page(s) declare a basis (run check:basis --stamp)`];
  }
  const byPage = new Map(lock.pages.map((p) => [p.page, p]));
  for (const d of tracked) {
    const record = byPage.get(d.contentPath);
    if (!record) {
      problems.push(`${d.contentPath}: declares a basis but has NO record in ${BASIS_LOCK_PATH} (run check:basis --stamp --only ${d.section}/${d.slug})`);
      continue;
    }
    const recorded = new Map((record.sources ?? []).map((s) => [key(s), s]));
    for (const s of d.basis) {
      const r = recorded.get(key(s));
      if (!r) {
        problems.push(`${d.contentPath}: basis ${key(s)} has no lock record (re-stamp the page after checking it against that file)`);
        continue;
      }
      if (!SHA1_RE.test(r.ref ?? '')) problems.push(`${d.contentPath}: ${key(s)}: recorded ref must be a full 40-character commit`);
      if (!SHA256_RE.test(r.sha256 ?? '')) problems.push(`${d.contentPath}: ${key(s)}: recorded sha256 is missing or malformed`);
    }
    const declared = new Set(d.basis.map(key));
    for (const k of recorded.keys()) {
      if (!declared.has(k)) problems.push(`${d.contentPath}: lock records ${k}, which the manifest no longer lists (stale record)`);
    }
  }
  const trackedPaths = new Set(tracked.map((d) => d.contentPath));
  for (const p of byPage.keys()) {
    if (!trackedPaths.has(p)) problems.push(`${p}: has a record in ${BASIS_LOCK_PATH} but declares no basis in the manifest (stale record)`);
  }
  return problems;
}

/**
 * The network half. `readSource({ repo, path })` resolves to the file's text as it
 * is upstream today, or throws when it cannot be reached. Every recorded file ends
 * up in exactly one of three lists, and they are reported separately: "could not
 * look" must never read as "looked, and it is fine".
 */
export async function compareBasis(lockPages, readSource) {
  const result = { unchanged: [], moved: [], unreachable: [] };
  /** One read per upstream file, however many pages cite it. */
  const cache = new Map();
  const read = (s) => {
    if (!cache.has(key(s))) {
      cache.set(
        key(s),
        Promise.resolve()
          .then(() => readSource(s))
          .then((text) => ({ sha256: sha256(text) }), (err) => ({ error: String(err?.message ?? err) })),
      );
    }
    return cache.get(key(s));
  };
  for (const page of lockPages) {
    for (const s of page.sources ?? []) {
      const now = await read(s);
      const item = { page: page.page, repo: s.repo, path: s.path, ref: s.ref };
      if (now.error) result.unreachable.push({ ...item, reason: now.error });
      else if (now.sha256 === s.sha256) result.unchanged.push(item);
      else result.moved.push(item);
    }
  }
  return result;
}

/** The lock after stamping some pages: their records replaced, every other kept. */
export function mergeBasisRecords(existing, updates) {
  const byPage = new Map(existing.map((p) => [p.page, p]));
  for (const u of updates) byPage.set(u.page, u);
  return [...byPage.values()].sort((a, b) => a.page.localeCompare(b.page));
}
