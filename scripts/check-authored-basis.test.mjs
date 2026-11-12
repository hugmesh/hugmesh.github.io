/**
 * Site-written pages and the upstream files they were checked against
 * (scripts/lib/basis.mjs, scripts/check-authored-basis.mjs).
 *
 *   node --test scripts/check-authored-basis.test.mjs
 *
 * The rules first, as pure functions. Then the script itself, run against a
 * throwaway site and a throwaway upstream repository: it has to say "unchanged"
 * while the file is as recorded, "moved" once a commit changes it, and it must
 * refuse to pass when it could not read anything.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile, execFileSync } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SECTIONS, validateManifest } from './lib/manifest.mjs';
import { basisDeclProblems, basisLockProblems, compareBasis, mergeBasisRecords, sha256 } from './lib/basis.mjs';

const run = promisify(execFile);
const SCRIPT = path.join(path.dirname(fileURLToPath(import.meta.url)), 'check-authored-basis.mjs');
const REF = 'a'.repeat(40);

const page = (basis) => ({ section: 'reference', slug: 'svc', authored: 'site', contentPath: 'content/reference/svc.md', basis });
const record = (text, extra = {}) => ({
  page: 'content/reference/svc.md',
  sources: [{ repo: 'hugmesh-svc', path: 'README.md', ref: REF, sha256: sha256(text), ...extra }],
});

test('rule: a site-written page must declare its basis, even an empty one', () => {
  assert.match(basisDeclProblems({ authored: 'site' }).join(), /needs "basis"/);
  assert.deepEqual(basisDeclProblems({ authored: 'site', basis: [] }), []);
  assert.deepEqual(basisDeclProblems({ authored: 'site', basis: [{ repo: 'hugmesh-svc', path: 'README.md' }] }), []);
  assert.deepEqual(basisDeclProblems({ authored: 'site', basis: [{ repo: '.github', path: 'profile/README.md' }] }), []);
});

test('rule: a basis names a file inside a hugmesh repository, once', () => {
  const bad = (basis, re) => assert.match(basisDeclProblems({ authored: 'site', basis }).join(), re);
  bad([{ repo: 'someone-else', path: 'README.md' }], /not a hugmesh repository/);
  bad([{ repo: 'hugmesh-svc', path: '../other/README.md' }], /inside the repository/);
  bad([{ repo: 'hugmesh-svc', path: '/etc/passwd' }], /inside the repository/);
  bad([{ repo: 'hugmesh-svc', path: '' }], /inside the repository/);
  bad([{ repo: 'hugmesh-svc', path: 'README.md' }, { repo: 'hugmesh-svc', path: 'README.md' }], /listed twice/);
  assert.match(basisDeclProblems({ repo: 'hugmesh-svc', path: 'README.md', basis: [] }).join(), /vendored page is tracked by the sync lock/);
});

test('the manifest loader enforces the rule', () => {
  const docs = SECTIONS.map((s) => ({ section: s.id, slug: 'first', title: `First page of ${s.id}`, summary: `About ${s.id}.`, authored: 'site', basis: [] }));
  const sections = Object.fromEntries(SECTIONS.map((s) => [s.id, { groups: [{ id: 'main', title: 'Main', pages: [`/${s.id}/first`] }] }]));
  assert.doesNotThrow(() => validateManifest({ sections, docs }));
  delete docs[0].basis;
  assert.throws(() => validateManifest({ sections, docs }), /needs "basis"/);
});

test('offline: every declared file needs a lock record, and no record may be left over', () => {
  const basis = [{ repo: 'hugmesh-svc', path: 'README.md' }];
  assert.deepEqual(basisLockProblems([page(basis)], { pages: [record('x')] }), []);
  assert.deepEqual(basisLockProblems([page([])], null), [], 'nothing tracked, so no lock is needed');
  assert.match(basisLockProblems([page(basis)], null).join(), /missing or unreadable/);
  assert.match(basisLockProblems([page(basis)], { pages: [] }).join(), /NO record/);
  assert.match(
    basisLockProblems([page([...basis, { repo: 'hugmesh-svc', path: 'app.yml' }])], { pages: [record('x')] }).join(),
    /hugmesh-svc\/app\.yml has no lock record/,
  );
  assert.match(basisLockProblems([page(basis)], { pages: [record('x', { ref: 'abc1234' })] }).join(), /full 40-character commit/);
  assert.match(basisLockProblems([page(basis)], { pages: [record('x', { sha256: '' })] }).join(), /sha256 is missing/);
  const other = { ...record('x'), page: 'content/reference/gone.md' };
  assert.match(basisLockProblems([page(basis)], { pages: [record('x'), other] }).join(), /gone\.md: has a record .* \(stale record\)/);
  const extra = record('x');
  extra.sources.push({ repo: 'hugmesh-svc', path: 'old.yml', ref: REF, sha256: sha256('y') });
  assert.match(basisLockProblems([page(basis)], { pages: [extra] }).join(), /old\.yml, which the manifest no longer lists/);
});

test('upstream: unchanged, moved and unreachable are three different answers', async () => {
  const pages = [
    record('as recorded'),
    { page: 'content/reference/b.md', sources: [{ repo: 'hugmesh-b', path: 'README.md', ref: REF, sha256: sha256('old text') }] },
    { page: 'content/reference/c.md', sources: [{ repo: 'hugmesh-c', path: 'README.md', ref: REF, sha256: sha256('z') }] },
  ];
  const upstream = { 'hugmesh-svc/README.md': 'as recorded', 'hugmesh-b/README.md': 'new text' };
  const r = await compareBasis(pages, async (s) => {
    const text = upstream[`${s.repo}/${s.path}`];
    if (text === undefined) throw new Error('HTTP 404');
    return text;
  });
  assert.deepEqual(r.unchanged.map((x) => x.page), ['content/reference/svc.md']);
  assert.deepEqual(r.moved.map((x) => x.page), ['content/reference/b.md']);
  assert.deepEqual(r.unreachable.map((x) => [x.page, x.reason]), [['content/reference/c.md', 'HTTP 404']]);
});

test('upstream: a file two pages cite is read once', async () => {
  let reads = 0;
  const two = [record('t'), { ...record('t'), page: 'content/reference/other.md' }];
  const r = await compareBasis(two, async () => { reads += 1; return 't'; });
  assert.equal(reads, 1);
  assert.equal(r.unchanged.length, 2);
});

test('stamping one page keeps every other record', () => {
  const a = { page: 'content/a.md', sources: [] };
  const b = { page: 'content/b.md', sources: [{ repo: 'hugmesh-b', path: 'README.md', ref: REF, sha256: '1' }] };
  const after = mergeBasisRecords([b, a], [{ page: 'content/b.md', sources: [{ ...b.sources[0], sha256: '2' }] }]);
  assert.deepEqual(after.map((p) => p.page), ['content/a.md', 'content/b.md']);
  assert.equal(after[1].sources[0].sha256, '2');
  assert.equal(after[0], a);
});

// ── the script, end to end ────────────────────────────────────────────────────
const gitIn = (dir, ...args) =>
  execFileSync('git', ['-C', dir, '-c', 'user.name=test', '-c', 'user.email=test@example.invalid', '-c', 'commit.gpgsign=false', ...args], { stdio: 'pipe' });

/** A site with one site-written page, and a workspace holding its upstream repo. */
async function sandbox() {
  const dir = await mkdtemp(path.join(tmpdir(), 'basis-'));
  const site = path.join(dir, 'site');
  const ws = path.join(dir, 'ws');
  const repo = path.join(ws, 'hugmesh-svc');
  await mkdir(path.join(site, 'content', 'reference'), { recursive: true });
  await mkdir(path.join(site, 'landings'), { recursive: true });
  await mkdir(repo, { recursive: true });
  const docs = SECTIONS.map((s) => ({ section: s.id, slug: 'first', title: `First page of ${s.id}`, summary: `About ${s.id}.`, authored: 'site', basis: [] }));
  docs.find((d) => d.section === 'reference').basis = [{ repo: 'hugmesh-svc', path: 'README.md' }];
  const sections = Object.fromEntries(SECTIONS.map((s) => [s.id, { groups: [{ id: 'main', title: 'Main', pages: [`/${s.id}/first`] }] }]));
  await writeFile(path.join(site, 'docs.manifest.json'), JSON.stringify({ sections, docs }));
  for (const s of SECTIONS) await writeFile(path.join(site, 'landings', `${s.id}.md`), 'An intro.\n');
  await writeFile(path.join(repo, 'README.md'), 'The service listens on port 8080.\n');
  gitIn(repo, 'init', '-q');
  gitIn(repo, 'add', '.');
  gitIn(repo, 'commit', '-q', '-m', 'one');
  const script = (...args) =>
    run('node', [SCRIPT, '--root', site, ...args], { env: { ...process.env, GITHUB_ACTIONS: '' } }).then(
      (r) => ({ code: 0, out: r.stdout + r.stderr }),
      (e) => ({ code: e.code, out: `${e.stdout ?? ''}${e.stderr ?? ''}` }),
    );
  return { dir, site, ws, repo, script };
}

test('script: stamp, then unchanged; an upstream commit makes it moved; --strict fails on moved', async (t) => {
  const s = await sandbox();
  t.after(() => rm(s.dir, { recursive: true, force: true }));

  const before = await s.script('--workspace', s.ws);
  assert.equal(before.code, 1, before.out);
  assert.match(before.out, /missing or unreadable/);

  const stamped = await s.script('--stamp', '--workspace', s.ws);
  assert.equal(stamped.code, 0, stamped.out);
  const lock = JSON.parse(await readFile(path.join(s.site, 'content', '.basis.lock.json'), 'utf8'));
  assert.equal(lock.pages.length, 1);
  assert.match(lock.pages[0].sources[0].ref, /^[0-9a-f]{40}$/);

  const same = await s.script('--workspace', s.ws);
  assert.equal(same.code, 0, same.out);
  assert.match(same.out, /1 unchanged, 0 moved, 0 unreachable, of 1 recorded file/);

  // An uncommitted edit is not upstream: the script reads the commit, not the tree.
  await writeFile(path.join(s.repo, 'README.md'), 'The service listens on port 9090.\n');
  assert.match((await s.script('--workspace', s.ws)).out, /1 unchanged, 0 moved/);

  gitIn(s.repo, 'commit', '-q', '-am', 'two');
  const moved = await s.script('--workspace', s.ws);
  assert.equal(moved.code, 0, 'a moved file is a warning, not a failure');
  assert.match(moved.out, /MOVED\s+content\/reference\/first\.md: hugmesh-svc\/README\.md has changed since [0-9a-f]{7}/);
  assert.match(moved.out, /0 unchanged, 1 moved, 0 unreachable/);

  const strict = await s.script('--workspace', s.ws, '--strict');
  assert.equal(strict.code, 1, strict.out);

  const restamped = await s.script('--stamp', '--workspace', s.ws, '--only', 'reference/first');
  assert.equal(restamped.code, 0, restamped.out);
  assert.match((await s.script('--workspace', s.ws, '--strict')).out, /1 unchanged, 0 moved/);
});

test('script: when nothing can be read, the run fails instead of passing', async (t) => {
  const s = await sandbox();
  t.after(() => rm(s.dir, { recursive: true, force: true }));
  await s.script('--stamp', '--workspace', s.ws);
  const empty = path.join(s.dir, 'empty-ws');
  await mkdir(empty);
  const r = await s.script('--workspace', empty);
  assert.equal(r.code, 2, r.out);
  assert.match(r.out, /UNREACHABLE\s+content\/reference\/first\.md/);
  assert.match(r.out, /0 unchanged, 0 moved, 1 unreachable/);
  assert.match(r.out, /nothing was checked/);
});

test('script: --stamp refuses to run without a checkout to take the commit from', async (t) => {
  const s = await sandbox();
  t.after(() => rm(s.dir, { recursive: true, force: true }));
  const r = await s.script('--stamp');
  assert.equal(r.code, 2, r.out);
  assert.match(r.out, /needs --workspace/);
});

// ── wiring: a check nobody runs protects nothing ──────────────────────────────
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('the check is wired: an npm script, both workflows, and this file in the test list', async () => {
  const pkg = JSON.parse(await readFile(path.join(ROOT, 'package.json'), 'utf8'));
  assert.equal(pkg.scripts['check:basis'], 'node scripts/check-authored-basis.mjs');
  assert.match(pkg.scripts['test:releases'], /scripts\/check-authored-basis\.test\.mjs/);

  /** The step that runs the command, as the lines from its `- name:` to the next step. */
  const stepOf = async (file) => {
    const text = await readFile(path.join(ROOT, '.github', 'workflows', file), 'utf8');
    const steps = text.split(/\n(?= {6}- )/);
    const mine = steps.filter((s) => /^\s+run: npm run check:basis\s*$/m.test(s));
    assert.equal(mine.length, 1, `${file} must run check:basis in exactly one step`);
    return mine[0];
  };
  // On a pull request the step may fail the job: it only fails when it read nothing.
  assert.doesNotMatch(await stepOf('ci.yml'), /continue-on-error/);
  // A deploy must not wait on it.
  assert.match(await stepOf('pages.yml'), /continue-on-error: true/);
});

test('the committed lock covers what the committed manifest declares', async () => {
  const { loadManifest } = await import('./lib/manifest.mjs');
  const { docs } = await loadManifest(ROOT);
  const lock = JSON.parse(await readFile(path.join(ROOT, 'content', '.basis.lock.json'), 'utf8'));
  assert.deepEqual(basisLockProblems(docs, lock), []);
  const tracked = docs.filter((d) => d.authored && d.basis.length > 0);
  assert.ok(tracked.length >= 25, `only ${tracked.length} site-written pages are tracked`);
  // Every service page and the Gateways page were written from a repository's files.
  for (const d of docs.filter((x) => x.authored && (x.section === 'reference' || x.route === '/architecture/gateway'))) {
    if (d.route === '/reference/third-party-licences') continue;
    assert.ok(d.basis.length > 0, `${d.route} declares no basis`);
  }
});
