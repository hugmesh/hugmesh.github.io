/**
 * The coverage check, against a fake GitHub. No network.
 *
 *   node --test scripts/check-release-sources.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeClient } from './fetch-releases.mjs';
import { compareCoverage, findReleaseRepos, isReleaseWorkflow, sourceRepos } from './check-release-sources.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sources = JSON.parse(await readFile(path.join(ROOT, 'release-sources.json'), 'utf8'));

function fakeGitHub(repos, workflows) {
  return async (url) => {
    const u = new URL(url);
    let body = null;
    if (u.pathname === '/orgs/hugmesh/repos') body = u.searchParams.get('page') === '1' ? repos : [];
    const m = /^\/repos\/hugmesh\/([^/]+)\/contents\/\.github\/workflows$/.exec(u.pathname);
    if (m && workflows[m[1]]) body = workflows[m[1]].map((name) => ({ name }));
    return body === null
      ? new Response('{"message":"Not Found"}', { status: 404 })
      : new Response(JSON.stringify(body), { status: 200 });
  };
}

const client = (f) => makeClient({ fetchImpl: f, sleep: async () => {} });

test('finds public, non-archived repositories with a release workflow, and only those', async () => {
  const f = fakeGitHub(
    [
      { name: 'hugmesh-commons', private: false, archived: false },
      { name: 'hugmesh-generator', private: false, archived: false },
      { name: 'hugmesh.github.io', private: false, archived: false },
      { name: 'old-thing', private: false, archived: true },
      { name: '.github-private', private: true, archived: false },
    ],
    {
      'hugmesh-commons': ['ci.yml', 'release.yml'],
      'hugmesh-generator': ['ci.yml', 'studio-release.yml', 'mesh-node-release.yml'],
      'hugmesh.github.io': ['ci.yml', 'pages.yml'],
      'old-thing': ['release.yml'],
      '.github-private': ['release.yml'],
    },
  );
  assert.deepEqual(await findReleaseRepos(client(f), 'hugmesh'), [
    { repo: 'hugmesh/hugmesh-commons', workflows: ['release.yml'] },
    { repo: 'hugmesh/hugmesh-generator', workflows: ['mesh-node-release.yml', 'studio-release.yml'] },
  ]);
});

test('a releasing repository missing from release-sources.json is reported', () => {
  const found = [...sourceRepos(sources).keys()].map((repo) => ({ repo, workflows: ['release.yml'] }));
  assert.deepEqual(compareCoverage(found, sources), [], 'the committed sources cover themselves');

  const withNew = [...found, { repo: 'hugmesh/hugmesh-new-thing', workflows: ['release.yml'] }];
  assert.match(compareCoverage(withNew, sources).join('\n'), /hugmesh-new-thing has a release workflow/);

  const noPackages = { ...sources, packages: [] };
  const problems = compareCoverage(found, noPackages);
  for (const r of ['build-config', 'parent', 'commons', 'auth-core']) {
    assert.match(problems.join('\n'), new RegExp(`hugmesh/hugmesh-${r} has a release workflow`));
  }
});

test('a listed source whose repository stopped releasing is reported', () => {
  const found = [...sourceRepos(sources).keys()]
    .filter((r) => r !== 'hugmesh/hugmesh-games')
    .map((repo) => ({ repo, workflows: ['release.yml'] }));
  assert.match(compareCoverage(found, sources).join('\n'), /hugmesh-games is listed .* but has no release workflow/);
});

test('release workflow names', () => {
  for (const n of ['release.yml', 'studio-release.yml', 'mesh-node-release.yaml', 'release-chain.yml']) {
    assert.ok(isReleaseWorkflow(n), n);
  }
  for (const n of ['ci.yml', 'pages.yml', 'release.md']) assert.ok(!isReleaseWorkflow(n), n);
});

test('the committed sources name the four Maven libraries, the Studio, mesh-node and the games images', () => {
  const repos = sourceRepos(sources);
  for (const r of ['build-config', 'parent', 'commons', 'auth-core']) {
    assert.ok(repos.get(`hugmesh/hugmesh-${r}`)?.some((w) => w.startsWith('package ')), r);
  }
  assert.ok(repos.get('hugmesh/hugmesh-generator').includes('studio'));
  assert.ok(repos.get('hugmesh/hugmesh-generator').includes('image ghcr.io/hugmesh/hugmesh-mesh-node'));
  assert.equal(repos.get('hugmesh/hugmesh-games').length, 5, 'five games images');
});
