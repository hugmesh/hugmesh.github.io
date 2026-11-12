/**
 * The project-board generator, against recorded GraphQL answers.
 *
 *   node --test scripts/fetch-board.test.mjs
 *   UPDATE_FIXTURES=1 node --test scripts/fetch-board.test.mjs   # rewrite the page's fixture
 *
 * Nothing here touches the network: every request goes to a fake fetch that answers
 * from a list and records what was asked.
 *
 * THE FIXTURES (scripts/fixtures/board/). The two small-board pages are in the exact
 * shape the real board answered with on 2026-11-12, and EVERY VALUE IN THEM IS
 * INVENTED: the repositories do not exist and no title was copied. A real answer is
 * never committed, because a maintainer's token reads private repositories too.
 * refused.not-found.json is what GitHub answers for a project it will not show
 * (recorded by asking for a number that does not exist). No narrow token existed to
 * record refused.insufficient-scopes.json with, so that one is written from GitHub's
 * documentation of the error.
 *
 * THE POINT. The generator's output is what the Project board page renders. The
 * committed src/app/board/testing/board.fixture.json is produced here and must equal
 * what the generator produces now, and the page's Karma spec renders that same file.
 * So a change to the generator that the page cannot read fails one side or the other.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  BOARD_QUERY,
  BoardFetchFailure,
  FIELD_NAMES,
  GRAPHQL_URL,
  buildBoardData,
  forCommand,
  makeGraphql,
  publishable,
  readBoardOnce,
  summarise,
  toBoardData,
  unavailable,
} from './fetch-board.mjs';
import { BOARD_DATA_SCHEMA, BOARD_UNAVAILABLE_REASONS, validateBoardData } from '../src/app/board/board-data.ts';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RECORDED = path.join(ROOT, 'scripts/fixtures/board');
const PAGE_FIXTURE = path.join(ROOT, 'src/app/board/testing/board.fixture.json');
const NOW = new Date('2026-11-01T08:00:00Z');
const TOKEN = 'test-token-not-a-real-one';
const recorded = async (name) => JSON.parse(await readFile(path.join(RECORDED, name), 'utf8'));
const clone = (v) => JSON.parse(JSON.stringify(v));

const smallBoard = [await recorded('small-board.page-1.json'), await recorded('small-board.page-2.json')];
const NOT_FOUND = await recorded('refused.not-found.json');
const INSUFFICIENT_SCOPES = await recorded('refused.insufficient-scopes.json');

const json = (body, status = 200, headers = {}) => ({ status, body: JSON.stringify(body), headers });

/**
 * A fetch that answers from `answers` in order (the last one repeats), and records
 * every request. An answer may be a function, to throw like a dropped connection.
 */
function fakeFetch(answers) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, method: init.method, headers: init.headers, body: JSON.parse(init.body), redirect: init.redirect });
    const a = answers[Math.min(calls.length - 1, answers.length - 1)];
    const r = typeof a === 'function' ? a() : a;
    return {
      status: r.status,
      ok: r.status >= 200 && r.status < 300,
      headers: { get: (k) => r.headers[k.toLowerCase()] ?? null },
      json: async () => JSON.parse(r.body),
    };
  };
  return { fetchImpl, calls };
}

/** buildBoardData over a fake fetch, with no waiting between retries. */
async function build(answers, extra = {}) {
  const { fetchImpl, calls } = fakeFetch(answers);
  const logs = [];
  const log = (m) => logs.push(m);
  const sleep = async () => {};
  const graphql = makeGraphql({ fetchImpl, token: TOKEN, sleep, log });
  const { data, note } = await buildBoardData({ token: TOKEN, graphql, now: NOW, sleep, log, ...extra });
  return { data, note, calls, logs };
}

// ── a large board, made of invented items in the recorded shape ─────────────
const head = clone(smallBoard[0].data.organization.projectV2);
delete head.items;
const template = smallBoard[0].data.organization.projectV2.items.nodes[0];

function bigNode(i) {
  const n = clone(template);
  n.id = `PVTI_big${i}`;
  n.content.number = i;
  n.content.title = `Invented item ${i}`;
  n.content.url = `https://github.com/hugmesh/example-api/issues/${i}`;
  return n;
}

/** `total` invented items as pages of `size`; `said` is what each page claims the board holds. */
function bigPages(total, size = 100, said = total) {
  const nodes = Array.from({ length: total }, (_, i) => bigNode(i + 1));
  const pages = [];
  for (let at = 0; at < total || pages.length === 0; at += size) {
    const slice = nodes.slice(at, at + size);
    const last = at + size >= total;
    pages.push({
      data: {
        organization: {
          projectV2: { ...clone(head), items: { totalCount: said, pageInfo: { hasNextPage: !last, endCursor: `cursor-${at + slice.length}` }, nodes: slice } },
        },
      },
    });
  }
  return pages;
}

// ── what is asked for ────────────────────────────────────────────────────────

test('the query asks GitHub for the safe subset only', () => {
  // Fields that would bring back what the site must not publish.
  for (const forbidden of ['body', 'bodyText', 'bodyHTML', 'comments', 'assignees', 'author', 'participants', 'reviews', 'milestone', 'fieldValues', 'creator', 'editor', 'email']) {
    assert.doesNotMatch(BOARD_QUERY, new RegExp(`\\b${forbidden}\\b`), `the query must not ask for ${forbidden}`);
  }
  // Only these four of the board's own fields, by name. Team, Iteration, the dates and
  // the free-text Code/branch field are never named, so they never arrive.
  const asked = [...BOARD_QUERY.matchAll(/(?:field|fieldValueByName)\(name: "([^"]+)"\)/g)].map((m) => m[1]);
  assert.deepEqual([...new Set(asked)].sort(), ['Priority', 'Size', 'Status', 'Wave']);
  assert.deepEqual(Object.values(FIELD_NAMES).sort(), ['Priority', 'Size', 'Status', 'Wave']);
  // A draft has nothing the site shows, so nothing of it is asked for (not even its title).
  assert.doesNotMatch(BOARD_QUERY, /DraftIssue/);
  // Visibility comes in the SAME answer as the item it decides about.
  assert.match(BOARD_QUERY, /repository \{ nameWithOwner visibility isPrivate \}/);
});

test('the token goes to api.github.com as a bearer header, never anywhere a redirect points', async () => {
  const { calls } = await build(smallBoard.map((p) => json(p)));
  assert.equal(calls.length, 2);
  for (const c of calls) {
    assert.equal(c.url, GRAPHQL_URL);
    assert.equal(c.url, 'https://api.github.com/graphql');
    assert.equal(c.method, 'POST');
    assert.equal(c.headers.authorization, `Bearer ${TOKEN}`);
    assert.equal(c.redirect, 'error');
    assert.equal(c.body.query, BOARD_QUERY);
    assert.ok(!JSON.stringify(c.body).includes(TOKEN), 'the token is never in the request body');
  }
  assert.deepEqual(calls.map((c) => c.body.variables), [
    { org: 'hugmesh', number: 1, first: 100, after: null },
    { org: 'hugmesh', number: 1, first: 100, after: 'Y3Vyc29yOmV4YW1wbGUwOA==' },
  ]);
});

// ── the small board: what is published, and what is not ─────────────────────

test('the small board becomes the fixture the page renders', async () => {
  const { data, note } = await build(smallBoard.map((p) => json(p)));
  assert.equal(note, null);
  assert.deepEqual(validateBoardData(data), []);
  if (process.env.UPDATE_FIXTURES) await writeFile(PAGE_FIXTURE, JSON.stringify(data, null, 2) + '\n');
  assert.deepEqual(data, JSON.parse(await readFile(PAGE_FIXTURE, 'utf8')), 'run with UPDATE_FIXTURES=1 if the change is intended');

  assert.equal(data.state, 'ok');
  assert.equal(data.schema, BOARD_DATA_SCHEMA);
  assert.equal(data.generated, NOW.toISOString());
  assert.deepEqual(data.project, { title: 'Example work tracker', url: 'https://github.com/orgs/hugmesh/projects/1', public: true });
  // The board's own names, in the board's own order.
  assert.deepEqual(data.statuses, ['Proposed', 'Todo', 'In progress', 'Ready for testing', 'Done testing', 'Accepted']);
  assert.deepEqual(data.priorities, ['P0 Release blocker', 'P1 High', 'P2 Medium', 'P3 Post-release']);
  assert.deepEqual(data.sizes, ['XS', 'S', 'M', 'L', 'XL']);
  assert.deepEqual(data.waves, ['W1', 'W2', 'W3']);
});

test('an item carries exactly the published fields, in the board\'s order', async () => {
  const { data } = await build(smallBoard.map((p) => json(p)));
  assert.deepEqual(data.items[0], {
    title: 'Sign-in page forgets the chosen language',
    type: 'issue',
    repo: 'hugmesh/example-api',
    number: 12,
    url: 'https://github.com/hugmesh/example-api/issues/12',
    state: 'open',
    status: 'In progress',
    priority: 'P1 High',
    size: 'M',
    wave: 'W2',
    labels: ['bug'],
    // The later of "the issue changed" and "its place on the board changed".
    updated: '2026-10-11T09:00:00.000Z',
  });
  assert.deepEqual(
    data.items.map((i) => `${i.repo}#${i.number}`),
    [
      'hugmesh/example-api#12', 'hugmesh/example-api#7', 'hugmesh/example-ui#31', 'hugmesh/example-ui#28',
      'example-org/shared-lib#3', 'hugmesh/example-api#15', 'hugmesh/example-api#2', 'hugmesh/example-ui#40',
      'hugmesh/example-ui#41', 'hugmesh/example-api#16',
    ],
  );
  const pull = data.items.find((i) => i.type === 'pull');
  assert.deepEqual([pull.url, pull.state], ['https://github.com/hugmesh/example-ui/pull/31', 'merged']);
  const bare = data.items.find((i) => i.number === 15);
  assert.deepEqual([bare.status, bare.priority, bare.size, bare.wave, bare.labels], [null, null, null, null, []]);
  assert.equal(data.items.find((i) => i.number === 16).updated, '2026-10-30T12:30:00.000Z');
});

test('an item from a private or internal repository is dropped and counted, whichever way the token sees it', async () => {
  const { data } = await build(smallBoard.map((p) => json(p)));
  // One PRIVATE (a token that can read it), one INTERNAL, one REDACTED with no content
  // at all (a token that cannot): three, and none of them in the file.
  assert.equal(data.withheld.notPublic, 3);
  const text = JSON.stringify(data);
  assert.ok(!text.includes('must never be published'), 'a private title reached the file');
  assert.ok(!text.includes('example-private') && !text.includes('example-internal'), 'a private repository name reached the file');
  assert.equal(data.items.length + data.withheld.notPublic + data.withheld.drafts, 14, 'every item is published or counted');
});

test('a draft item is dropped and counted', async () => {
  const { data } = await build(smallBoard.map((p) => json(p)));
  assert.equal(data.withheld.drafts, 1);
  assert.equal(data.withheld.held, 0);
  assert.ok(data.items.every((i) => i.url.startsWith('https://github.com/')));
});

test('a title is carried as the text it is, markup and all', async () => {
  const { data } = await build(smallBoard.map((p) => json(p)));
  assert.equal(data.items.find((i) => i.number === 28).title, '<img src=x onerror="alert(1)"> in a room name must be shown as text');
});

test('visibility must say PUBLIC twice: any other answer withholds the item', () => {
  const lists = { statuses: ['Todo'], priorities: [], sizes: [], waves: [] };
  const node = clone(template);
  node.status = { name: 'Todo' };
  node.priority = node.size = node.wave = null;
  assert.ok(publishable(node, lists).item);
  for (const repository of [
    { nameWithOwner: 'hugmesh/example-api', visibility: 'PRIVATE', isPrivate: true },
    { nameWithOwner: 'hugmesh/example-api', visibility: 'INTERNAL', isPrivate: true },
    { nameWithOwner: 'hugmesh/example-api', visibility: 'PUBLIC', isPrivate: true },
    { nameWithOwner: 'hugmesh/example-api', visibility: 'PRIVATE', isPrivate: false },
    { nameWithOwner: 'hugmesh/example-api', isPrivate: false },
    { nameWithOwner: 'hugmesh/example-api', visibility: 'PUBLIC' },
    null,
  ]) {
    const n = clone(node);
    n.content.repository = repository;
    assert.deepEqual(publishable(n, lists), { withheld: 'notPublic' }, JSON.stringify(repository));
  }
  // What a token that cannot read the repository gets: no content, whatever kind GitHub names.
  for (const hidden of [{ type: 'REDACTED', content: null }, { type: 'ISSUE', content: null }, { type: 'PULL_REQUEST' }, { type: 'REDACTED', content: clone(node.content) }]) {
    const n = { ...clone(node), ...hidden };
    if (!('content' in hidden)) delete n.content;
    assert.deepEqual(publishable(n, lists), { withheld: 'notPublic' }, JSON.stringify(hidden).slice(0, 60));
  }
});

// ── a board of more than 500 items ──────────────────────────────────────────

test('513 items over six pages are all read, each page asked for with the cursor of the one before', async () => {
  const pages = bigPages(513);
  assert.equal(pages.length, 6);
  const { data, calls, note } = await build(pages.map((p) => json(p)));
  assert.equal(note, null);
  assert.equal(data.state, 'ok');
  assert.equal(data.items.length, 513);
  assert.deepEqual(validateBoardData(data), []);
  assert.equal(calls.length, 6);
  assert.deepEqual(calls.map((c) => c.body.variables.after), [null, 'cursor-100', 'cursor-200', 'cursor-300', 'cursor-400', 'cursor-500']);
  assert.equal(data.items[0].number, 1);
  assert.equal(data.items[512].number, 513);
});

// ── no token ────────────────────────────────────────────────────────────────

test('with no token nothing is asked and the file says "unavailable: no-token"', async () => {
  for (const token of [undefined, null, '', '   ', '\n']) {
    const { fetchImpl, calls } = fakeFetch([json({})]);
    const { data, note } = await buildBoardData({ token, graphql: makeGraphql({ fetchImpl, token }), now: NOW });
    assert.deepEqual(data, { schema: BOARD_DATA_SCHEMA, generated: NOW.toISOString(), state: 'unavailable', reason: 'no-token' }, JSON.stringify(token));
    assert.match(note, /BOARD_READ_TOKEN is not set/);
    assert.equal(calls.length, 0, 'no request may be made without a token');
    assert.deepEqual(validateBoardData(data), []);
  }
});

// ── HTTP errors ─────────────────────────────────────────────────────────────

test('HTTP 401 and a plain 403 mean the token was refused: no retry, "unauthorized"', async () => {
  for (const status of [401, 403]) {
    const { data, note, calls } = await build([json({ message: 'Bad credentials' }, status)]);
    assert.deepEqual([data.state, data.reason], ['unavailable', 'unauthorized']);
    assert.equal(calls.length, 1);
    assert.equal(note, `GitHub refused the token (HTTP ${status})`);
  }
});

test('a server error or a rate limit is retried three times, then "fetch-failed"', async () => {
  for (const answer of [json({}, 500), json({}, 502), json({}, 429), json({}, 403, { 'x-ratelimit-remaining': '0' }), json({}, 403, { 'retry-after': '60' })]) {
    const { data, calls } = await build([answer]);
    assert.deepEqual([data.state, data.reason], ['unavailable', 'fetch-failed'], `HTTP ${answer.status}`);
    assert.equal(calls.length, 3, `HTTP ${answer.status} is retried`);
  }
});

test('a dropped connection or an answer that is not JSON is retried, then "fetch-failed"', async () => {
  const dropped = await build([
    () => {
      throw new TypeError(`fetch failed: could not reach the host with ${TOKEN}`);
    },
  ]);
  assert.deepEqual([dropped.data.state, dropped.data.reason, dropped.calls.length], ['unavailable', 'fetch-failed', 3]);
  assert.equal(dropped.note, 'the request to GitHub did not complete');
  assert.ok(!dropped.logs.join('\n').includes(TOKEN), 'an error message is never repeated: it could hold anything');
  const html = await build([{ status: 200, body: '<html>gateway</html>', headers: {} }]);
  assert.deepEqual([html.data.state, html.data.reason, html.calls.length], ['unavailable', 'fetch-failed', 3]);
});

test('an answer with neither data nor errors is a failure, not an empty board and not a refusal', async () => {
  for (const body of [{}, { data: null }, { data: [] }, []]) {
    const { data, calls } = await build([json(body)]);
    assert.deepEqual([data.state, data.reason, calls.length], ['unavailable', 'fetch-failed', 3], JSON.stringify(body));
  }
});

test('one bad answer followed by good ones still gives the whole board', async () => {
  const { data, calls } = await build([json({}, 502), ...smallBoard.map((p) => json(p))]);
  assert.equal(data.state, 'ok');
  assert.equal(data.items.length, 10);
  assert.equal(calls.length, 3);
});

test('any other HTTP status is a failure, not a board', async () => {
  const { data, calls } = await build([json({ message: 'Unprocessable' }, 422)]);
  assert.deepEqual([data.state, data.reason, calls.length], ['unavailable', 'fetch-failed', 1]);
});

// ── GraphQL errors ──────────────────────────────────────────────────────────

test('a token without the scope, or one that cannot see the board, is "unauthorized"', async () => {
  for (const refusal of [INSUFFICIENT_SCOPES, NOT_FOUND]) {
    const { data, calls } = await build([json(refusal)]);
    assert.deepEqual([data.state, data.reason], ['unavailable', 'unauthorized'], refusal.errors[0].type);
    assert.equal(calls.length, 1, 'a refusal is not retried');
  }
  // A project the token cannot see can also come back as plain nulls.
  const nulls = await build([json({ data: { organization: null } })]);
  assert.deepEqual([nulls.data.state, nulls.data.reason], ['unavailable', 'unauthorized']);
});

test('nothing GitHub says about the token reaches the file or the log', async () => {
  const { data, note, logs } = await build([json(INSUFFICIENT_SCOPES)]);
  const said = [JSON.stringify(data), note, ...logs].join('\n');
  // GitHub's message names the scopes the token has. Only its error code may be repeated.
  assert.ok(!said.includes('read:org') && !said.includes('has only been granted') && !said.includes('settings/tokens'), said);
  assert.equal(note, 'GitHub would not show the board to this token (INSUFFICIENT_SCOPES)');
  assert.ok(!said.includes(TOKEN));
  // An error code that is not a plain word is not repeated either.
  const odd = await build([json({ errors: [{ type: 'a code with <markup> & spaces', message: 'x' }] })]);
  assert.equal(odd.note, 'GitHub answered with GraphQL errors (OTHER)');
});

test('errors beside partial data are a failure: half a board is never published', async () => {
  // HTTP 200, the first page complete and valid, and an error for something else in it.
  const partial = clone(smallBoard[0]);
  partial.errors = [{ type: 'SERVICE_UNAVAILABLE', path: ['organization', 'projectV2', 'items', 'nodes', 3], message: 'Something went wrong while executing your query.' }];
  const { data, calls } = await build([json(partial)]);
  assert.deepEqual([data.state, data.reason], ['unavailable', 'fetch-failed']);
  assert.equal(calls.length, 3, 'retried, since that kind of error can pass');
  assert.ok(!('items' in data), 'an unavailable file carries no items at all');
  assert.deepEqual(validateBoardData(data), []);
});

// ── a partial page ──────────────────────────────────────────────────────────

test('a page with a hole in it (a null item) is "incomplete"', async () => {
  const holed = clone(smallBoard);
  holed[1].data.organization.projectV2.items.nodes[2] = null;
  const { data, calls } = await build([...holed, ...holed, ...holed].map((p) => json(p)));
  assert.deepEqual([data.state, data.reason], ['unavailable', 'incomplete']);
  assert.ok(!('items' in data));
  assert.equal(calls.length, 6, 'the whole board is read three times before giving up');
});

test('a hole is a hole even when the count still adds up', async () => {
  // Fourteen items arrive and the board says fourteen, but one more slot came back
  // empty, or came back with nothing to tell it apart by.
  for (const extra of [null, 'not an item', { ...clone(template), id: undefined }, { ...clone(template), id: 42 }]) {
    const pages = clone(smallBoard);
    pages[1].data.organization.projectV2.items.nodes.push(extra);
    const { data } = await build(pages.map((p) => json(p)));
    assert.deepEqual([data.state, data.reason], ['unavailable', 'incomplete'], JSON.stringify(extra)?.slice(0, 40));
  }
});

test('fewer items than the board says it holds is "incomplete", after reading the whole board three times', async () => {
  // Every page claims 520 items; 513 arrive.
  const pages = bigPages(513, 100, 520);
  const answers = [...pages, ...pages, ...pages].map((p) => json(p));
  const { data, calls, note } = await build(answers);
  assert.deepEqual([data.state, data.reason], ['unavailable', 'incomplete']);
  assert.equal(note, '513 items were read but the board holds 520');
  assert.equal(calls.length, 18, 'three complete reads of six pages');
});

test('a board that changed while it was read is read again, and the second whole read is published', async () => {
  // First read: an item moved between two pages, so it is seen twice and another is missed.
  const moved = bigPages(250);
  moved[1].data.organization.projectV2.items.nodes[0] = clone(moved[0].data.organization.projectV2.items.nodes[5]);
  const steady = bigPages(250);
  const { data, calls } = await build([...moved, ...steady].map((p) => json(p)));
  assert.equal(data.state, 'ok');
  assert.equal(data.items.length, 250);
  assert.equal(new Set(data.items.map((i) => i.number)).size, 250, 'no item twice');
  assert.equal(calls.length, 6);
});

test('a cursor that does not move, or is missing, ends the read as "incomplete" instead of looping', async () => {
  const stuck = clone(smallBoard[0]);
  const { data, calls } = await build([json(stuck)]);
  assert.deepEqual([data.state, data.reason], ['unavailable', 'incomplete']);
  assert.equal(calls.length, 6, 'two requests a read (the second page repeats the first cursor), three reads');

  const missing = clone(smallBoard[0]);
  missing.data.organization.projectV2.items.pageInfo.endCursor = null;
  const m = await build([json(missing)]);
  assert.deepEqual([m.data.state, m.data.reason, m.calls.length], ['unavailable', 'incomplete', 3]);
});

test('a board that never ends is given up on', async () => {
  let n = 0;
  const endless = async () => ({
    organization: {
      projectV2: { ...clone(head), items: { totalCount: 1_000_000, pageInfo: { hasNextPage: true, endCursor: `c${++n}` }, nodes: [bigNode(n)] } },
    },
  });
  await assert.rejects(readBoardOnce(endless, { org: 'hugmesh', number: 1, maxPages: 7 }), (e) => {
    assert.ok(e instanceof BoardFetchFailure);
    assert.equal(e.reason, 'incomplete');
    assert.equal(e.message, 'the board did not end after 7 pages');
    return true;
  });
  assert.equal(n, 7);
});

test('a page that is not in the shape asked for is "incomplete"', async () => {
  for (const breakIt of [
    (items) => delete items.nodes,
    (items) => delete items.pageInfo,
    (items) => (items.totalCount = 'many'),
    (items) => (items.nodes[0].id = ''),
  ]) {
    const page = clone(smallBoard[1]);
    breakIt(page.data.organization.projectV2.items);
    const { data } = await build([json(page)]);
    assert.deepEqual([data.state, data.reason], ['unavailable', 'incomplete'], String(breakIt));
  }
});

// ── a public item that is not what was asked for ────────────────────────────

test('a public item with a wrong address, an unknown kind, state or field value fails the board rather than being guessed at', async () => {
  const cases = {
    'an address on another host': (n) => (n.content.url = 'https://example.com/hugmesh/example-api/issues/12'),
    'an address that is a script': (n) => (n.content.url = 'javascript:alert(1)'),
    'an address for another number': (n) => (n.content.url = 'https://github.com/hugmesh/example-api/issues/13'),
    'a repository name that is a path': (n) => (n.content.repository.nameWithOwner = 'hugmesh/..'),
    'no title': (n) => (n.content.title = '   '),
    'a number that is not one': (n) => (n.content.number = '12'),
    'an unknown state': (n) => (n.content.state = 'LOCKED'),
    'an unknown kind of item': (n) => (n.type = 'DISCUSSION'),
    'a kind that disagrees with its content': (n) => (n.content.__typename = 'PullRequest'),
    'a status the board does not list': (n) => (n.status = { name: 'Blocked' }),
    'no time at all': (n) => {
      n.updatedAt = null;
      n.content.updatedAt = null;
    },
  };
  for (const [what, breakIt] of Object.entries(cases)) {
    const pages = clone(smallBoard);
    breakIt(pages[0].data.organization.projectV2.items.nodes[0]);
    const { data } = await build(pages.map((p) => json(p)));
    assert.deepEqual([data.state, data.reason], ['unavailable', 'incomplete'], what);
  }
});

test('whatever the generator builds is checked before it is written: a file the page could not read becomes "invalid"', async () => {
  // Two board items that are the same issue. GitHub does not allow it, which is the
  // point: nothing here trusts the reader to have produced a valid file.
  const pages = clone(smallBoard);
  const nodes = pages[1].data.organization.projectV2.items.nodes;
  nodes[0] = { ...clone(pages[0].data.organization.projectV2.items.nodes[0]), id: 'PVTI_exampleTwin' };
  const { data, note } = await build(pages.map((p) => json(p)));
  assert.deepEqual([data.state, data.reason], ['unavailable', 'invalid']);
  assert.match(note, /^what was read does not match the shape the page reads \(1 problem\(s\), the first: items\[5\] \(hugmesh\/example-api#12\) is listed twice\)$/);
  assert.deepEqual(validateBoardData(data), []);
});

test('an archived item is no longer on the board: not listed, not counted as withheld', () => {
  const pages = clone(smallBoard);
  const nodes = pages.flatMap((p) => p.data.organization.projectV2.items.nodes);
  nodes[0].isArchived = true;
  const logs = [];
  const data = toBoardData({ project: pages[0].data.organization.projectV2, nodes }, { now: NOW, log: (m) => logs.push(m) });
  assert.equal(data.items.length, 9);
  assert.deepEqual(data.withheld, { notPublic: 3, drafts: 1, held: 0 });
  assert.deepEqual(logs, ['1 archived item(s) are no longer on the board and are not listed']);
});

test('a board without one of the four fields still publishes, with that value empty on every item', async () => {
  const pages = clone(smallBoard);
  for (const p of pages) {
    // What GitHub answers for a field of another type, or none of that name.
    p.data.organization.projectV2.waveField = null;
    for (const n of p.data.organization.projectV2.items.nodes) n.wave = null;
  }
  const { data, logs } = await build(pages.map((p) => json(p)));
  assert.equal(data.state, 'ok');
  assert.deepEqual(data.waves, []);
  assert.ok(data.items.every((i) => i.wave === null));
  assert.ok(logs.includes('the board has no single-select field called "Wave", so no item has one'));
});

// ── the private-word check ──────────────────────────────────────────────────

test('with a private-word list, an item that contains a word is left out and counted; the word is never named', async () => {
  const pages = clone(smallBoard);
  pages[0].data.organization.projectV2.items.nodes[1].content.title = 'Move the ZebraFish deployment to the new cluster';
  pages[1].data.organization.projectV2.items.nodes[0].content.labels.nodes.push({ name: 'zebrafish' });
  const denylist = { entries: [{ word: 'quagga', line: 2 }, { word: 'zebrafish', line: 5 }] };
  const { data, note, logs } = await build(pages.map((p) => json(p)), { denylist });
  assert.equal(data.state, 'ok');
  assert.deepEqual(data.withheld, { notPublic: 3, drafts: 1, held: 2 });
  assert.equal(data.items.length, 8);
  assert.ok(!JSON.stringify(data).toLowerCase().includes('zebrafish'));
  assert.ok(![note, ...logs].join('\n').toLowerCase().includes('zebrafish'));
  // The same board with no list on the machine publishes them: the check only exists where the list does.
  const without = await build(pages.map((p) => json(p)), { denylist: { skipped: '/nowhere' } });
  assert.equal(without.data.items.length, 10);
});

test('a private word in the board\'s own names makes the whole file unavailable, naming only the denylist line', async () => {
  const pages = clone(smallBoard);
  for (const p of pages) p.data.organization.projectV2.title = 'Zebrafish tracker';
  const { data, note } = await build(pages.map((p) => json(p)), { denylist: { entries: [{ word: 'zebrafish', line: 5 }] } });
  assert.deepEqual([data.state, data.reason], ['unavailable', 'private-word']);
  assert.equal(note, "the board's own names contain 1 entry of the private denylist (line 5 of the denylist file)");
  assert.ok(!JSON.stringify(data).toLowerCase().includes('zebrafish'));
});

test('a private-word list that is configured but unreadable stops the board, without asking GitHub', async () => {
  const { data, calls } = await build([json(smallBoard[0])], { denylist: { error: 'cannot read the private denylist' } });
  assert.deepEqual([data.state, data.reason], ['unavailable', 'private-word']);
  assert.equal(calls.length, 0);
});

// ── the validator both sides share ──────────────────────────────────────────

test('the validator refuses a file that carries more than the safe subset', async () => {
  const good = JSON.parse(await readFile(PAGE_FIXTURE, 'utf8'));
  assert.deepEqual(validateBoardData(good), []);
  const broken = (change) => {
    const d = clone(good);
    change(d);
    return validateBoardData(d);
  };
  assert.deepEqual(broken((d) => (d.items[0].assignees = ['someone'])), ['items[0] has a key this site does not publish: assignees']);
  assert.deepEqual(broken((d) => (d.items[0].body = 'text')), ['items[0] has a key this site does not publish: body']);
  assert.deepEqual(broken((d) => (d.codeBranch = 'x')), ['the file has a key this site does not publish: codeBranch']);
  assert.deepEqual(broken((d) => (d.project.description = 'x')), ['project has a key this site does not publish: description']);
  assert.deepEqual(broken((d) => delete d.items[0].labels), ['items[0].labels is missing', 'items[0].labels must be a list of names']);
});

test('the validator refuses an address that is not the item\'s own on github.com, and a value the file does not list', async () => {
  const good = JSON.parse(await readFile(PAGE_FIXTURE, 'utf8'));
  const broken = (change) => {
    const d = clone(good);
    change(d);
    return validateBoardData(d);
  };
  for (const url of ['javascript:alert(1)', 'https://example.com/hugmesh/example-api/issues/12', 'https://github.com/hugmesh/example-api/issues/12?x=1', '//github.com/hugmesh/example-api/issues/12', '']) {
    assert.deepEqual(broken((d) => (d.items[0].url = url)), ["items[0].url must be the item's own address on github.com"], url);
  }
  for (const repo of ['hugmesh/../x', 'hugmesh/..', '../example-api', './example-api', 'hugmesh', 'hugmesh/example api', 'hugmesh/example-api?x']) {
    assert.deepEqual(broken((d) => (d.items[0].repo = repo)), ['items[0].repo must be owner/name'], repo);
  }
  assert.deepEqual(broken((d) => (d.items[0].status = 'Blocked')), ['items[0].status must be null or one of statuses']);
  assert.deepEqual(broken((d) => (d.items[0].state = 'merged')), ['items[0].state must be "open" or "closed" (or "merged" for a pull request)']);
  assert.deepEqual(broken((d) => d.items.push(clone(d.items[0]))), ['items[10] (hugmesh/example-api#12) is listed twice']);
  assert.deepEqual(broken((d) => (d.project.url = 'https://example.com/orgs/hugmesh/projects/1')), ['project.url must be a GitHub organisation project address']);
  assert.deepEqual(broken((d) => (d.schema = BOARD_DATA_SCHEMA + 1)), [`schema must be ${BOARD_DATA_SCHEMA}`]);
  assert.deepEqual(broken((d) => (d.withheld.notPublic = -1)), ['withheld.notPublic must be a whole number, zero or more']);
  // The names are the board's: a renamed column is valid as long as the file agrees with itself.
  assert.deepEqual(
    broken((d) => {
      d.statuses = d.statuses.map((s) => (s === 'Todo' ? 'Backlog' : s));
      for (const i of d.items) if (i.status === 'Todo') i.status = 'Backlog';
    }),
    [],
  );
});

test('an "unavailable" file is small: a known reason and nothing else', () => {
  for (const reason of BOARD_UNAVAILABLE_REASONS) assert.deepEqual(validateBoardData(unavailable(reason, NOW)), [], reason);
  assert.deepEqual(validateBoardData({ ...unavailable('no-token', NOW), items: [] }), ['the file has a key this site does not publish: items']);
  assert.deepEqual(validateBoardData({ ...unavailable('no-token', NOW), reason: 'GitHub said: bad credentials' }), ['reason is not one this site knows']);
  assert.deepEqual(validateBoardData({ ...unavailable('no-token', NOW), state: 'half' }), ['state must be "ok" or "unavailable"']);
  assert.deepEqual(validateBoardData([]), ['the file is not a JSON object']);
});

test('the one-line summary says what the build will show', async () => {
  const { data } = await build(smallBoard.map((p) => json(p)));
  assert.equal(summarise(data), 'project board: 10 items from 3 repositories; left out: 3 not public, 1 draft(s), 0 held back by the private-word check');
  assert.equal(summarise(unavailable('no-token', NOW)), 'project board: not published by this build (no-token)');
});

// ── the command itself ──────────────────────────────────────────────────────

test('a line break cannot start a second workflow command inside an annotation', () => {
  assert.equal(forCommand('50% done\n::error::forged\r'), '50%25 done%0A::error::forged%0D');
});

test('run as a command with no token: exits 0, writes "unavailable", and takes a token from nowhere but the environment', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'fetch-board-'));
  try {
    const out = path.join(dir, 'board.json');
    const summary = path.join(dir, 'summary.md');
    // No BOARD_READ_TOKEN. GITHUB_TOKEN and GH_TOKEN are set, and a token is passed as an
    // argument: none of them may be used, so no request is made.
    const env = {
      PATH: process.env.PATH,
      HOME: dir,
      GITHUB_TOKEN: 'not-used',
      GH_TOKEN: 'not-used',
      GITHUB_ACTIONS: 'true',
      GITHUB_STEP_SUMMARY: summary,
    };
    const r = spawnSync(process.execPath, [path.join(ROOT, 'scripts/fetch-board.mjs'), '--out', out, '--token', 'not-used'], { env, encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr);
    const data = JSON.parse(await readFile(out, 'utf8'));
    assert.deepEqual([data.state, data.reason], ['unavailable', 'no-token']);
    assert.deepEqual(validateBoardData(data), []);
    assert.match(r.stdout, /^::notice title=Project board::project board: not published by this build \(no-token\): BOARD_READ_TOKEN is not set/m);
    assert.doesNotMatch(r.stdout, /::warning/, 'a missing token is the expected state of a fork: a notice, not a warning');
    assert.match(await readFile(summary, 'utf8'), /^\*\*Project board\.\*\* not published by this build \(no-token\)/);
    assert.ok(!(r.stdout + r.stderr).includes('not-used'));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
