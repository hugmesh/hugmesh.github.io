/**
 * The hourly run's question: does this build differ from the live site?
 *
 *   node --test scripts/published-data-changed.test.mjs
 *
 * The rule under test is in scripts/published-data-changed.mjs. Any doubt must end in
 * a deploy; the one thing that must NOT cause a deploy by itself is a build that
 * failed to reach GitHub for the board.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PASSING_REASONS, publishedDataChanged } from './published-data-changed.mjs';
import { BOARD_UNAVAILABLE_REASONS } from '../src/app/board/board-data.ts';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SCRIPT = path.join(ROOT, 'scripts/published-data-changed.mjs');
const fixture = async (rel) => JSON.parse(await readFile(path.join(ROOT, rel), 'utf8'));

const releases = await fixture('src/app/downloads/testing/releases.published.fixture.json');
const board = await fixture('src/app/board/testing/board.fixture.json');
const at = (data, generated) => JSON.stringify({ ...data, generated });
const HOUR_1 = '2026-11-01T08:17:00.000Z';
const HOUR_2 = '2026-11-01T09:17:00.000Z';
const noBoard = (reason) => ({ schema: board.schema, state: 'unavailable', reason });

const ask = (live, built) => publishedDataChanged({ live, built });
const same = { releases: at(releases, HOUR_1), board: at(board, HOUR_1) };

test('the same data an hour later is not a change', () => {
  const r = ask(same, { releases: at(releases, HOUR_2), board: at(board, HOUR_2) });
  assert.equal(r.changed, false);
  assert.deepEqual(r.reasons, ['release data: unchanged', 'project board: unchanged']);
});

test('new release data is a change', () => {
  const newer = { ...releases, studioRepo: 'hugmesh/another-repository' };
  const r = ask(same, { releases: at(newer, HOUR_2), board: at(board, HOUR_2) });
  assert.equal(r.changed, true);
  assert.deepEqual(r.reasons, ['release data: changed since the last deploy', 'project board: unchanged']);
});

test('one item moving to another status is a change', () => {
  const moved = JSON.parse(JSON.stringify(board));
  moved.items[1].status = 'In progress';
  const r = ask(same, { releases: at(releases, HOUR_2), board: at(moved, HOUR_2) });
  assert.equal(r.changed, true);
  assert.deepEqual(r.reasons, ['release data: unchanged', 'project board: changed since the last deploy']);
});

test('a live copy that is missing or unreadable counts as a change', () => {
  for (const broken of [null, '', '<html>not found</html>', '[]', 'null']) {
    assert.equal(ask({ ...same, board: broken }, same).changed, true, `board: ${JSON.stringify(broken)}`);
    assert.equal(ask({ ...same, releases: broken }, same).changed, true, `releases: ${JSON.stringify(broken)}`);
  }
});

test('a build with no readable file of its own counts as a change', () => {
  for (const broken of [null, '', 'not json']) {
    assert.equal(ask(same, { ...same, board: broken }).changed, true);
    assert.equal(ask(same, { ...same, releases: broken }).changed, true);
  }
  // Two files that are equally not the data are not "unchanged".
  for (const junk of ['[]', '"text"', '7']) {
    assert.equal(ask({ ...same, board: junk }, { ...same, board: junk }).changed, true, `board ${junk}`);
    assert.equal(ask({ ...same, releases: junk }, { ...same, releases: junk }).changed, true, `releases ${junk}`);
  }
});

test('a build that could not reach GitHub for the board does not replace a good live board', () => {
  for (const reason of ['fetch-failed', 'incomplete']) {
    const r = ask(same, { releases: at(releases, HOUR_2), board: at(noBoard(reason), HOUR_2) });
    assert.equal(r.changed, false, reason);
    assert.deepEqual(r.reasons, ['release data: unchanged', `project board: this build could not read it (${reason}); the live copy is left as it is`]);
  }
  // ...but it does not hide a release either.
  const newer = { ...releases, studioRepo: 'hugmesh/another-repository' };
  assert.equal(ask(same, { releases: at(newer, HOUR_2), board: at(noBoard('fetch-failed'), HOUR_2) }).changed, true);
});

test('a board that will stay unreadable until somebody acts IS a change: the page must say so', () => {
  for (const reason of ['no-token', 'unauthorized', 'private-word', 'invalid']) {
    const r = ask(same, { releases: at(releases, HOUR_2), board: at(noBoard(reason), HOUR_2) });
    assert.equal(r.changed, true, reason);
  }
  // Every reason the board file can carry is decided one way or the other here.
  assert.deepEqual([...BOARD_UNAVAILABLE_REASONS].filter((r) => !PASSING_REASONS.has(r)).sort(), ['invalid', 'no-token', 'private-word', 'unauthorized']);
  assert.ok([...PASSING_REASONS].every((r) => BOARD_UNAVAILABLE_REASONS.includes(r)));
});

test('a site that has never had the secret does not redeploy every hour', () => {
  const live = { releases: at(releases, HOUR_1), board: at(noBoard('no-token'), HOUR_1) };
  const built = { releases: at(releases, HOUR_2), board: at(noBoard('no-token'), HOUR_2) };
  assert.equal(ask(live, built).changed, false);
});

test('the board appearing for the first time, or coming back, is a change', () => {
  const built = { releases: at(releases, HOUR_2), board: at(board, HOUR_2) };
  assert.equal(ask({ releases: at(releases, HOUR_1), board: at(noBoard('no-token'), HOUR_1) }, built).changed, true);
  assert.equal(ask({ releases: at(releases, HOUR_1), board: null }, built).changed, true);
});

test('as a command: exit 0 only when nothing changed, and any mistake ends in a deploy', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'data-changed-'));
  const run = (...args) => spawnSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8' });
  try {
    const live = path.join(dir, 'live');
    const built = path.join(dir, 'built');
    await mkdir(live);
    await mkdir(built);
    await writeFile(path.join(live, 'releases.json'), at(releases, HOUR_1));
    await writeFile(path.join(live, 'board.json'), at(board, HOUR_1));
    await writeFile(path.join(built, 'releases.json'), at(releases, HOUR_2));
    await writeFile(path.join(built, 'board.json'), at(board, HOUR_2));
    const unchanged = run(live, built);
    assert.equal(unchanged.status, 0, unchanged.stderr);
    assert.match(unchanged.stdout, /published-data-changed: project board: unchanged/);

    await rm(path.join(live, 'board.json'));
    assert.equal(run(live, built).status, 1, 'no live board yet: deploy');
    assert.notEqual(run(live).status, 0, 'a missing argument must not read as "unchanged"');
    assert.notEqual(run(path.join(dir, 'nowhere'), path.join(dir, 'nowhere-either')).status, 0);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
