#!/usr/bin/env node
/**
 * Does the Downloads page list EVERY repository that releases something?
 *
 *   node scripts/check-release-sources.mjs [--org hugmesh] [--sources release-sources.json]
 *
 * release-sources.json is the list the page is generated from. It is written by
 * hand (names, labels, tag prefixes), so a new repository with a release
 * workflow could be added to the org and never appear on the page. This script
 * asks GitHub for every PUBLIC, non-archived repository in the org, looks in
 * each one's .github/workflows/ for a release workflow (a file whose name
 * contains "release"), and fails if any such repository is not named in
 * release-sources.json as the Studio, an image or a Maven package. It also
 * fails the other way round: a source whose repository has no release workflow
 * any more would show a "not released yet" line forever.
 *
 * It needs the network, so it is not part of `npm test` (which must pass
 * offline). The diff logic it relies on is tested offline in
 * scripts/check-release-sources.test.mjs, and `npm test` separately proves that
 * every source in release-sources.json reaches the rendered page. Run this
 * before a release, and whenever a repository is added to the org. A token in
 * GITHUB_TOKEN or GH_TOKEN only raises the rate limit; everything read is public.
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { makeClient } from './fetch-releases.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** A workflow file that publishes a release, judged by its name. */
export const isReleaseWorkflow = (name) => /release/i.test(name) && /\.ya?ml$/i.test(name);

/** Every repository named anywhere in release-sources.json, and as what. */
export function sourceRepos(sources) {
  const map = new Map();
  const add = (repo, what) => map.set(repo, [...(map.get(repo) ?? []), what]);
  add(sources.studio.repo, 'studio');
  for (const i of sources.images ?? []) add(i.repo, `image ${i.image}`);
  for (const p of sources.packages ?? []) add(p.repo, `package ${p.groupId}:${p.artifactId}`);
  return map;
}

/**
 * Public, non-archived repositories of `org` with at least one release workflow:
 * [{ repo: 'org/name', workflows: ['release.yml', ...] }], sorted by name.
 */
export async function findReleaseRepos(client, org) {
  const repos = [];
  for (let page = 1; page <= 10; page++) {
    const batch = await client.gh(`/orgs/${org}/repos?type=public&per_page=100&page=${page}`);
    if (!Array.isArray(batch) || batch.length === 0) break;
    repos.push(...batch);
    if (batch.length < 100) break;
  }
  const out = [];
  for (const r of repos.filter((r) => !r.private && !r.archived).sort((a, b) => a.name.localeCompare(b.name))) {
    const files = (await client.gh(`/repos/${org}/${r.name}/contents/.github/workflows`)) ?? [];
    const workflows = (Array.isArray(files) ? files : []).map((f) => f.name).filter(isReleaseWorkflow).sort();
    if (workflows.length) out.push({ repo: `${org}/${r.name}`, workflows });
  }
  return out;
}

/** What is wrong, as sentences. Empty means the page covers every releasing repository. */
export function compareCoverage(found, sources) {
  const listed = sourceRepos(sources);
  const releasing = new Set(found.map((f) => f.repo));
  const problems = [];
  for (const f of found) {
    if (!listed.has(f.repo)) {
      problems.push(`${f.repo} has a release workflow (${f.workflows.join(', ')}) but release-sources.json does not list it`);
    }
  }
  for (const [repo, what] of listed) {
    if (!releasing.has(repo)) problems.push(`${repo} is listed (${what.join('; ')}) but has no release workflow`);
  }
  return problems;
}

async function main(argv) {
  const arg = (name, fallback) => {
    const i = argv.indexOf(`--${name}`);
    return i === -1 ? fallback : argv[i + 1];
  };
  const org = arg('org', 'hugmesh');
  const sources = JSON.parse(await readFile(path.resolve(ROOT, arg('sources', 'release-sources.json')), 'utf8'));
  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || undefined;
  const client = makeClient({ token, log: (m) => console.warn(`check-release-sources: ${m}`) });
  const found = await findReleaseRepos(client, org);
  const listed = sourceRepos(sources);
  for (const f of found) {
    console.log(`  ${listed.has(f.repo) ? 'listed ' : 'MISSING'}  ${f.repo}  (${f.workflows.join(', ')})`);
  }
  const problems = compareCoverage(found, sources);
  if (problems.length) {
    for (const p of problems) console.error(`check-release-sources: ${p}`);
    process.exit(1);
  }
  console.log(`check-release-sources: all ${found.length} public ${org} repositories with a release workflow are on the Downloads page`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main(process.argv.slice(2)).catch((e) => {
    console.error(`check-release-sources: FAILED: ${e?.message ?? e}`);
    process.exit(1);
  });
}
