/**
 * Guard for .github/workflows/pages.yml: who holds which token scope, and what
 * starts the workflow.
 *
 *   node --test scripts/pages-workflow.test.mjs
 *
 * WHY. The build job runs `npm ci`, the release-data fetch and `ng build` every
 * hour and on every `releases-updated` dispatch. It must never hold `pages: write`
 * or an OIDC token (`id-token: write`): only the deploy job, which runs no code
 * from this repository, needs those. They used to be granted at workflow level,
 * which handed them to the build job too. The Downloads page also depends on the
 * dispatch receiver and the hourly fallback being present: without them a release
 * never reaches the page.
 *
 * The workflow is read with a deliberately small YAML reader (block mappings,
 * `{}`, `[a, b]`, block scalars skipped) so the guard needs no dependency that
 * package.json does not declare.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FILE = process.env.PAGES_WORKFLOW || path.join(ROOT, '.github/workflows/pages.yml');

function stripComment(line) {
  let quote = null;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quote) {
      if (c === quote) quote = null;
    } else if (c === '"' || c === "'") {
      quote = c;
    } else if (c === '#' && (i === 0 || /\s/.test(line[i - 1]))) {
      return line.slice(0, i);
    }
  }
  return line;
}

function scalar(raw) {
  const v = raw.trim();
  if (v === '{}') return {};
  if (v === '[]') return [];
  if (v.startsWith('[') && v.endsWith(']')) {
    return v.slice(1, -1).split(',').map((x) => scalar(x)).filter((x) => x !== '');
  }
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) return v.slice(1, -1);
  return v;
}

/** Parse the subset of YAML a workflow file uses into plain objects. */
export function parseWorkflow(text) {
  const lines = text.split('\n');
  const root = {};
  const stack = [{ indent: -1, node: root }];
  let blockScalarIndent = null;
  for (const rawLine of lines) {
    const indent = rawLine.length - rawLine.trimStart().length;
    if (blockScalarIndent !== null) {
      if (rawLine.trim() === '' || indent > blockScalarIndent) continue;
      blockScalarIndent = null;
    }
    const line = stripComment(rawLine).trimEnd();
    if (line.trim() === '') continue;
    while (stack.length > 1 && stack[stack.length - 1].indent >= indent) stack.pop();
    const parent = stack[stack.length - 1];
    const body = line.trim();
    let target = parent.node;
    let keyIndent = indent;
    let entry = body;
    if (body.startsWith('- ') || body === '-') {
      // A list item. `- key: value` starts a mapping whose later keys sit deeper
      // than the dash; a bare `- value` is kept as a string.
      if (!Array.isArray(parent.node.__list)) parent.node.__list = [];
      entry = body.slice(1).trimStart();
      keyIndent = indent + (body.length - entry.length);
      if (!/^[^:'"]+:(\s|$)/.test(entry)) {
        parent.node.__list.push(scalar(entry));
        continue;
      }
      target = {};
      parent.node.__list.push(target);
      stack.push({ indent, node: target });
    }
    const m = /^([^:]+?):(?:\s+(.*))?$/.exec(entry);
    if (!m) throw new Error(`pages-workflow guard cannot read line: ${rawLine}`);
    const key = scalar(m[1]);
    const rest = m[2] ?? '';
    if (/^[|>][-+]?$/.test(rest)) {
      target[key] = '<block scalar>';
      blockScalarIndent = keyIndent;
    } else if (rest === '') {
      const child = {};
      target[key] = child;
      stack.push({ indent: keyIndent, node: child });
    } else {
      target[key] = scalar(rest);
    }
  }
  // Turn `{ __list: [...] }` nodes that hold nothing else into arrays.
  const tidy = (n) => {
    if (Array.isArray(n)) return n.map(tidy);
    if (n && typeof n === 'object') {
      const keys = Object.keys(n);
      if (keys.length === 1 && keys[0] === '__list') return n.__list;
      for (const k of keys) n[k] = tidy(n[k]);
    }
    return n;
  };
  return tidy(root);
}

const wf = parseWorkflow(readFileSync(FILE, 'utf8'));
const WRITE_ONLY_FOR_DEPLOY = ['pages', 'id-token'];

test('no token scope is granted at workflow level', () => {
  assert.ok('permissions' in wf, 'pages.yml must set a top-level permissions block (an absent one inherits the repository default)');
  assert.deepEqual(wf.permissions, {}, 'top-level permissions must be exactly {}; grant scopes per job');
});

test('every job declares its own permissions', () => {
  assert.ok(wf.jobs && Object.keys(wf.jobs).length >= 2, 'expected the build and deploy jobs');
  for (const [name, job] of Object.entries(wf.jobs)) {
    assert.equal(typeof job.permissions, 'object', `job ${name} has no permissions block`);
  }
});

test('the build job reads only: contents and pages, nothing written, no OIDC token', () => {
  assert.deepEqual(wf.jobs.build.permissions, { contents: 'read', pages: 'read' });
});

test('only the deploy job holds pages: write and id-token: write, and nothing else', () => {
  assert.deepEqual(wf.jobs.deploy.permissions, { pages: 'write', 'id-token': 'write' });
  for (const [name, job] of Object.entries(wf.jobs)) {
    if (name === 'deploy') continue;
    for (const scope of WRITE_ONLY_FOR_DEPLOY) {
      assert.notEqual(job.permissions?.[scope], 'write', `job ${name} must not hold ${scope}: write`);
    }
    for (const [scope, level] of Object.entries(job.permissions ?? {})) {
      assert.notEqual(level, 'write', `job ${name} must not hold any write scope (found ${scope}: write)`);
    }
  }
});

test('a release elsewhere reaches the page: dispatch receiver plus hourly fallback', () => {
  assert.deepEqual(wf.on.repository_dispatch?.types, ['releases-updated'], 'repository_dispatch releases-updated receiver');
  assert.ok(Array.isArray(wf.on.schedule) && wf.on.schedule.some((s) => typeof s?.cron === 'string' && s.cron.trim() !== ''), 'schedule fallback');
  assert.ok('workflow_dispatch' in wf.on, 'manual refresh');
  assert.deepEqual(wf.on.push?.branches, ['main']);
});

test('no pull-request trigger can reach the write scopes', () => {
  for (const t of ['pull_request', 'pull_request_target', 'workflow_run']) {
    assert.ok(!(t in wf.on), `pages.yml must not run on ${t}`);
  }
});

test('both jobs run on GitHub-hosted runners, written literally', () => {
  for (const [name, job] of Object.entries(wf.jobs)) {
    assert.equal(job['runs-on'], 'ubuntu-latest', `job ${name}`);
  }
});

test('the release data is fetched and validated before the site is built', () => {
  const steps = wf.jobs.build.steps;
  assert.ok(Array.isArray(steps));
  const text = readFileSync(FILE, 'utf8');
  const fetchAt = text.indexOf('npm run fetch:releases');
  const buildAt = text.indexOf('npm run build');
  assert.ok(fetchAt > 0 && buildAt > fetchAt, 'npm run fetch:releases must run before npm run build');
  assert.ok(text.includes('validateReleaseData'), 'the Pages artifact step must validate assets/releases.json');
});

test('the reader itself: flow {} and block maps are told apart', () => {
  const parsed = parseWorkflow('permissions: {}\njobs:\n  a:\n    permissions:\n      pages: write # c\n    run: |\n      x: y\n    k: v\n');
  assert.deepEqual(parsed.permissions, {});
  assert.deepEqual(parsed.jobs.a.permissions, { pages: 'write' });
  assert.equal(parsed.jobs.a.k, 'v', 'block scalar contents must not leak into the mapping');
  assert.equal(parsed.jobs.a.x, undefined);
});
