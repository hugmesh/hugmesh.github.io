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
 * THE ONE SECRET. The build job is also handed BOARD_READ_TOKEN, to read the
 * project board. It may reach exactly one step, in that step's environment, before
 * `npm ci` has put any third-party code on the runner; it may never be an argument,
 * never be echoed, and no other secret may appear in the file at all.
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

const TEXT = readFileSync(FILE, 'utf8');
const wf = parseWorkflow(TEXT);
const WRITE_ONLY_FOR_DEPLOY = ['pages', 'id-token'];
/** The file without its comments: a comment that mentions a command must never satisfy a check. */
const CODE_LINES = TEXT.split('\n').map((l) => stripComment(l).trimEnd()).filter((l) => l.trim() !== '');
const CODE = CODE_LINES.join('\n');
const buildSteps = () => wf.jobs.build.steps;
const stepIndex = (pred, what) => {
  const hits = buildSteps().map((s, i) => (pred(s) ? i : -1)).filter((i) => i !== -1);
  assert.equal(hits.length, 1, `expected exactly one build step that ${what}, found ${hits.length}`);
  return hits[0];
};
const BOARD_SECRET = 'BOARD_READ_TOKEN';

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
  assert.ok(Array.isArray(buildSteps()));
  // Steps, not text: a comment that names the command must not pass for the step.
  const fetchAt = stepIndex((s) => s.run === 'npm run fetch:releases', 'runs npm run fetch:releases');
  const buildAt = stepIndex((s) => s.run === 'npm run build', 'runs npm run build');
  assert.ok(buildAt > fetchAt, 'npm run fetch:releases must run before npm run build');
  assert.ok(CODE.includes('validateReleaseData'), 'the Pages artifact step must validate assets/releases.json');
});

test('the project board is fetched before any dependency is installed, and before the build', () => {
  const boardAt = stepIndex((s) => s.env && BOARD_SECRET in s.env, `is handed ${BOARD_SECRET}`);
  const installAt = stepIndex((s) => s.run === 'npm ci', 'runs npm ci');
  const buildAt = stepIndex((s) => s.run === 'npm run build', 'runs npm run build');
  assert.ok(boardAt < installAt, 'the step that holds the board token must run BEFORE npm ci: no third-party code may be on the runner yet');
  assert.ok(boardAt < buildAt, 'the board must be fetched before the site is built');
  // Everything before it is an action, never a command: nothing has run that could
  // have changed the script the token is about to be handed to.
  for (const s of buildSteps().slice(0, boardAt)) {
    assert.ok(typeof s.uses === 'string' && s.run === undefined, `only actions may come before the board step, found: ${JSON.stringify(s)}`);
  }
});

test('the board step is one fixed command: the token is in its environment, never on a command line', () => {
  const step = buildSteps()[stepIndex((s) => s.env && BOARD_SECRET in s.env, `is handed ${BOARD_SECRET}`)];
  assert.deepEqual(step.env, { [BOARD_SECRET]: '${{ secrets.BOARD_READ_TOKEN }}' }, 'the step environment holds the token and nothing else');
  assert.equal(step.run, 'node scripts/fetch-board.mjs', 'no arguments, no shell around it, and not a multi-line script');
  assert.equal(step.uses, undefined);
  // It must run on every build and must be able to fail it (it only does when the
  // file cannot be written): a skipped or forgiven step would publish no file at all.
  assert.equal(step.if, undefined, 'the board step must not be conditional');
  assert.equal(step['continue-on-error'], undefined, 'the board step must not be allowed to fail quietly');
});

test('BOARD_READ_TOKEN is the only secret in the workflow, named on one line', () => {
  const secretLines = CODE_LINES.filter((l) => /\bsecrets\b/.test(l));
  assert.deepEqual(
    secretLines.map((l) => l.trim()),
    ['BOARD_READ_TOKEN: ${{ secrets.BOARD_READ_TOKEN }}'],
    'exactly one line may read a secret, and it must be the board step\'s environment',
  );
  // The name itself appears nowhere else in what runs: not in a `run:` block (which
  // would be an echo or an argument), not at job or workflow level.
  assert.deepEqual(CODE_LINES.filter((l) => l.includes(BOARD_SECRET)).map((l) => l.trim()), ['BOARD_READ_TOKEN: ${{ secrets.BOARD_READ_TOKEN }}']);
  assert.equal(wf.env, undefined, 'no workflow-level env: it would reach every step of every job');
  for (const [name, job] of Object.entries(wf.jobs)) {
    assert.equal(job.env, undefined, `job ${name} must not set a job-level env`);
    assert.equal(job.secrets, undefined, `job ${name} must not inherit or pass secrets`);
  }
});

test('no other step, and nothing in the deploy job, is handed the board token', () => {
  for (const [name, job] of Object.entries(wf.jobs)) {
    for (const step of job.steps) {
      const holds = JSON.stringify(step).includes('secrets.');
      const isBoardStep = name === 'build' && step.run === 'node scripts/fetch-board.mjs';
      assert.equal(holds, isBoardStep, `job ${name}: ${JSON.stringify(step).slice(0, 120)}`);
    }
  }
  assert.ok(!JSON.stringify(wf.jobs.deploy).includes('BOARD'), 'the deploy job never sees the board token');
});

test('the artifact is refused without a board file the page can read', () => {
  assert.ok(CODE.includes('validateBoardData'), 'the Pages artifact step must validate assets/board.json');
  assert.match(CODE, /\[ -f assets\/board\.json \] \|\| \{ echo "::error::assets\/board\.json missing from the Pages artifact"; exit 1; \}/);
});

test('the hourly run compares the board as well as the release data, through the tested script', () => {
  assert.match(CODE, /for f in releases\.json board\.json; do/);
  assert.match(CODE, /if node scripts\/published-data-changed\.mjs "\$live" dist\/browser\/assets; then/);
  // The decision still reaches the deploy job.
  assert.equal(wf.jobs.build.outputs.data_changed, '${{ steps.changed.outputs.changed }}');
  assert.match(wf.jobs.deploy.if, /needs\.build\.outputs\.data_changed != 'false'/);
  assert.match(wf.jobs.deploy.if, /needs\.build\.outputs\.pages_ready == 'true'/);
});

test('the reader itself: flow {} and block maps are told apart', () => {
  const parsed = parseWorkflow('permissions: {}\njobs:\n  a:\n    permissions:\n      pages: write # c\n    run: |\n      x: y\n    k: v\n');
  assert.deepEqual(parsed.permissions, {});
  assert.deepEqual(parsed.jobs.a.permissions, { pages: 'write' });
  assert.equal(parsed.jobs.a.k, 'v', 'block scalar contents must not leak into the mapping');
  assert.equal(parsed.jobs.a.x, undefined);
});
