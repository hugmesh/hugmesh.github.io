#!/usr/bin/env node
/**
 * Build src/assets/board.json from the GitHub project board.
 *
 *   node scripts/fetch-board.mjs [--out src/assets/board.json]
 *
 * WHY THIS EXISTS. The Project board page lists what is being worked on. That list
 * lives in an organisation-level GitHub Project, which a browser cannot read without
 * signing in to the API. So the Pages build reads it once, here, and the page shows
 * the copy, exactly as the Downloads page shows release data (fetch-releases.mjs).
 *
 * THE TOKEN. An organisation Project cannot be read with a workflow's own
 * GITHUB_TOKEN, so this script reads BOARD_READ_TOKEN from its ENVIRONMENT and from
 * nowhere else: never an argument (arguments show in process lists and logs), never
 * a file, and it is never printed. An unset secret reaches a workflow step as an
 * empty string, which counts as "no token".
 *
 * WHAT IS PUBLISHED. The query asks GitHub only for what the site may show, so the
 * rest never reaches this process: no bodies, no comments, no assignees, and none
 * of the board's other fields (Team, Iteration, dates, the free-text Code/branch).
 * Per item: title, issue or pull request, repository, number, address, open or
 * closed, Status, Priority, Size, Wave, label names and the last change.
 * An item is published only when ALL of this holds:
 *
 *   - it is an issue or a pull request (a draft has no address and is left out);
 *   - GitHub says its repository's visibility is PUBLIC, in the same answer;
 *   - its address is exactly the one its repository and number give.
 *
 * Everything else is counted and left out. A token that cannot read a private
 * repository gets those items back with no content at all; a token that can gets
 * them with their repository marked PRIVATE. Both end the same way.
 *
 * THIS SCRIPT NEVER FAILS A BUILD OVER THE BOARD. With no token, or when the board
 * cannot be read WHOLE (a network error, a refusal, a GraphQL error beside partial
 * data, a page with a hole in it, a count that does not add up), it writes a small
 * file that says "unavailable" with one of a fixed list of reasons, and exits 0.
 * The page then says plainly that the board is not shown here and links to GitHub.
 * Half a board is never written as if it were all of it. In a workflow a failure is
 * also a `::warning::` and a line in the run summary, so it is not silent.
 *
 * NOTHING FROM GITHUB IS LOGGED OR WRITTEN EXCEPT THE DATA ABOVE. The run log and
 * the file are both public. A refusal can describe the token (which scopes it has),
 * so messages here are fixed sentences with at most an HTTP status or one of
 * GitHub's error codes, never GitHub's own text.
 *
 * PRIVATE WORDS. Where this machine has the private-word list (lib/denylist.mjs) an
 * item that contains one is left out and counted, and a word anywhere else in the
 * file makes it "unavailable". A public CI runner has no such list; see the README.
 *
 * The output is validated with the same function the page uses
 * (src/app/board/board-data.ts) before it is written.
 */
import { appendFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  BOARD_DATA_SCHEMA,
  BOARD_ORG,
  BOARD_PROJECT_NUMBER,
  boardItemUrl,
  isRepoName,
  validateBoardData,
} from '../src/app/board/board-data.ts';
import { denylistLines, loadDenylist } from './lib/denylist.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const GRAPHQL_URL = 'https://api.github.com/graphql';
/** The name of the one environment variable that may hold the token. */
export const TOKEN_ENV = 'BOARD_READ_TOKEN';
/** The board's fields this site shows. A field with another name is never asked for. */
export const FIELD_NAMES = { status: 'Status', priority: 'Priority', size: 'Size', wave: 'Wave' };

const optionNames = '... on ProjectV2SingleSelectField { options { name } }';
const chosenName = '... on ProjectV2ItemFieldSingleSelectValue { name }';
const itemFacts =
  'title number url state updatedAt repository { nameWithOwner visibility isPrivate } labels(first: 20) { nodes { name } }';

/**
 * One page of the board. `id` is asked for only to tell two copies of an item apart
 * when the board changes between pages; it is not published.
 */
export const BOARD_QUERY = `
query Board($org: String!, $number: Int!, $first: Int!, $after: String) {
  organization(login: $org) {
    projectV2(number: $number) {
      title
      url
      public
      statusField: field(name: "${FIELD_NAMES.status}") { ${optionNames} }
      priorityField: field(name: "${FIELD_NAMES.priority}") { ${optionNames} }
      sizeField: field(name: "${FIELD_NAMES.size}") { ${optionNames} }
      waveField: field(name: "${FIELD_NAMES.wave}") { ${optionNames} }
      items(first: $first, after: $after) {
        totalCount
        pageInfo { hasNextPage endCursor }
        nodes {
          id
          type
          isArchived
          updatedAt
          status: fieldValueByName(name: "${FIELD_NAMES.status}") { ${chosenName} }
          priority: fieldValueByName(name: "${FIELD_NAMES.priority}") { ${chosenName} }
          size: fieldValueByName(name: "${FIELD_NAMES.size}") { ${chosenName} }
          wave: fieldValueByName(name: "${FIELD_NAMES.wave}") { ${chosenName} }
          content {
            __typename
            ... on Issue { ${itemFacts} }
            ... on PullRequest { ${itemFacts} }
          }
        }
      }
    }
  }
}`;

/**
 * The board could not be read whole. `reason` is one of BOARD_UNAVAILABLE_REASONS and
 * goes into the public file; `message` is a fixed sentence for the run log.
 */
export class BoardFetchFailure extends Error {
  constructor(reason, message) {
    super(message);
    this.reason = reason;
  }
}

const isObj = (v) => typeof v === 'object' && v !== null && !Array.isArray(v);

/** GitHub's GraphQL error codes that mean "this token may not read that". */
const REFUSALS = new Set(['INSUFFICIENT_SCOPES', 'FORBIDDEN', 'NOT_FOUND']);
/** An error code is a short word from GitHub's own list; anything else is not repeated. */
const errorCode = (e) => (isObj(e) && typeof e.type === 'string' && /^[A-Za-z_]{1,40}$/.test(e.type) ? e.type : 'OTHER');

/**
 * A GraphQL client with retries over an injectable fetch, so the tests can serve
 * recorded answers and nothing in them touches the network. Returns `data`.
 *
 * An answer that carries `errors` is a failure even when it carries `data` as well:
 * GraphQL answers HTTP 200 with whatever part of the query worked, and treating that
 * as success is how half a board would be published.
 */
export function makeGraphql({ fetchImpl = globalThis.fetch, token, sleep, attempts = 3, log = () => {} } = {}) {
  const wait = sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));

  return async function graphql(query, variables) {
    let last;
    for (let i = 1; i <= attempts; i++) {
      if (i > 1) await wait(2000 * (i - 1));
      let res;
      try {
        res = await fetchImpl(GRAPHQL_URL, {
          method: 'POST',
          headers: {
            accept: 'application/vnd.github+json',
            'content-type': 'application/json',
            'x-github-api-version': '2022-11-28',
            'user-agent': 'hugmesh-site-board-fetch',
            authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ query, variables }),
          // The token goes to api.github.com and nowhere a redirect might point.
          redirect: 'error',
          signal: AbortSignal.timeout(30_000),
        });
      } catch {
        last = new BoardFetchFailure('fetch-failed', 'the request to GitHub did not complete');
        log(`attempt ${i}/${attempts}: ${last.message}`);
        continue;
      }
      if (res.status === 401) throw new BoardFetchFailure('unauthorized', 'GitHub refused the token (HTTP 401)');
      const limited =
        res.status === 429 ||
        (res.status === 403 && (res.headers.get('x-ratelimit-remaining') === '0' || res.headers.get('retry-after') !== null));
      if (res.status === 403 && !limited) {
        throw new BoardFetchFailure('unauthorized', 'GitHub refused the token (HTTP 403)');
      }
      if (limited || res.status >= 500) {
        last = new BoardFetchFailure('fetch-failed', `GitHub answered HTTP ${res.status}${limited ? ' (rate limited)' : ''}`);
        log(`attempt ${i}/${attempts}: ${last.message}`);
        continue;
      }
      if (!res.ok) throw new BoardFetchFailure('fetch-failed', `GitHub answered HTTP ${res.status}`);

      let body;
      try {
        body = await res.json();
      } catch {
        last = new BoardFetchFailure('fetch-failed', 'GitHub answered with something that is not JSON');
        log(`attempt ${i}/${attempts}: ${last.message}`);
        continue;
      }
      if (isObj(body) && Array.isArray(body.errors) && body.errors.length > 0) {
        const codes = [...new Set(body.errors.map(errorCode))].sort();
        if (codes.some((c) => REFUSALS.has(c))) {
          throw new BoardFetchFailure('unauthorized', `GitHub would not show the board to this token (${codes.join(', ')})`);
        }
        last = new BoardFetchFailure('fetch-failed', `GitHub answered with GraphQL errors (${codes.join(', ')})`);
        log(`attempt ${i}/${attempts}: ${last.message}`);
        continue;
      }
      if (!isObj(body) || !isObj(body.data)) {
        last = new BoardFetchFailure('fetch-failed', 'GitHub answered without any data');
        log(`attempt ${i}/${attempts}: ${last.message}`);
        continue;
      }
      return body.data;
    }
    throw last;
  };
}

/**
 * Every item on the board, once: page after page until GitHub says there are no more.
 *
 * "incomplete" is thrown, never papered over, when a page has a hole (a null item),
 * when the cursor does not move, when there are implausibly many pages, or when the
 * number of distinct items read is not the number the board says it holds. The board
 * is edited all day, so an item can move between two pages while they are read: the
 * same item is then seen twice (kept once, by id) and another is missed, which the
 * count catches. The caller reads the whole board again in that case.
 */
export async function readBoardOnce(graphql, { org, number, pageSize = 100, maxPages = 50 }) {
  const seen = new Map();
  let project = null;
  let total = null;
  let after = null;
  for (let page = 1; ; page++) {
    if (page > maxPages) throw new BoardFetchFailure('incomplete', `the board did not end after ${maxPages} pages`);
    const data = await graphql(BOARD_QUERY, { org, number, first: pageSize, after });
    const p = data?.organization?.projectV2;
    if (!isObj(p)) throw new BoardFetchFailure('unauthorized', 'the board is not visible to this token');
    const items = p.items;
    if (!isObj(items) || !Array.isArray(items.nodes) || !isObj(items.pageInfo) || !Number.isInteger(items.totalCount)) {
      throw new BoardFetchFailure('incomplete', `page ${page} of the board is not in the shape that was asked for`);
    }
    for (const node of items.nodes) {
      if (!isObj(node) || typeof node.id !== 'string' || node.id === '') {
        throw new BoardFetchFailure('incomplete', `page ${page} of the board has an item that did not arrive`);
      }
      seen.set(node.id, node);
    }
    project ??= p;
    total = items.totalCount;
    if (items.pageInfo.hasNextPage !== true) break;
    const next = items.pageInfo.endCursor;
    if (typeof next !== 'string' || next === '' || next === after) {
      throw new BoardFetchFailure('incomplete', `page ${page} of the board says there is more but gives no way to ask for it`);
    }
    after = next;
  }
  if (seen.size !== total) {
    throw new BoardFetchFailure('incomplete', `${seen.size} items were read but the board holds ${total}`);
  }
  return { project, nodes: [...seen.values()] };
}

/**
 * readBoardOnce and then `convert`, both done again from the start when either says
 * "incomplete": an item can also name a field value that was renamed on the board
 * between the first page (which lists the names) and a later one.
 */
export async function readBoard(graphql, options, { attempts = 3, sleep, log = () => {}, convert = (raw) => raw } = {}) {
  const wait = sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  let last;
  for (let i = 1; i <= attempts; i++) {
    if (i > 1) await wait(1500 * (i - 1));
    try {
      return convert(await readBoardOnce(graphql, options));
    } catch (e) {
      if (!(e instanceof BoardFetchFailure) || e.reason !== 'incomplete') throw e;
      last = e;
      log(`read ${i}/${attempts}: ${e.message}`);
    }
  }
  throw last;
}

const options = (field) => [
  ...new Set((Array.isArray(field?.options) ? field.options : []).map((o) => o?.name).filter((n) => typeof n === 'string' && n.trim() !== '')),
];

/** A field's chosen option, null when none is chosen. A name the board does not list is a hole. */
function chosen(node, key, list) {
  const name = node[key]?.name;
  if (name === undefined || name === null) return null;
  if (typeof name !== 'string' || !list.includes(name)) {
    throw new BoardFetchFailure('incomplete', `an item has a ${key} the board does not list`);
  }
  return name;
}

const STATES = { issue: { OPEN: 'open', CLOSED: 'closed' }, pull: { OPEN: 'open', CLOSED: 'closed', MERGED: 'merged' } };

/**
 * What one board item becomes: `{ item }` to publish, `{ withheld }` naming the
 * count it adds to, or `{ skip: true }` for an archived item (it is no longer on the
 * board). Throws "incomplete" for a public item that is not in the shape asked for:
 * that is GitHub answering differently from what this script was written against,
 * and guessing would publish something nobody checked.
 */
export function publishable(node, lists) {
  if (node.isArchived === true) return { skip: true };
  if (node.type === 'DRAFT_ISSUE') return { withheld: 'drafts' };
  const c = node.content;
  // Not readable with this token: GitHub hides the content (and says REDACTED).
  if (node.type === 'REDACTED' || c === null || c === undefined) return { withheld: 'notPublic' };
  const type =
    node.type === 'ISSUE' && c.__typename === 'Issue' ? 'issue' : node.type === 'PULL_REQUEST' && c.__typename === 'PullRequest' ? 'pull' : null;
  if (!type) throw new BoardFetchFailure('incomplete', 'the board has an item of a kind this script does not know');

  const repo = c.repository;
  // PUBLIC, said twice by GitHub, or the item is not published. Anything else
  // (PRIVATE, INTERNAL, a missing answer) is counted and left out.
  if (!isObj(repo) || repo.visibility !== 'PUBLIC' || repo.isPrivate !== false) return { withheld: 'notPublic' };

  const state = STATES[type][c.state];
  const item = {
    title: typeof c.title === 'string' ? c.title.trim() : '',
    type,
    repo: repo.nameWithOwner,
    number: c.number,
    url: c.url,
    state,
    status: chosen(node, 'status', lists.statuses),
    priority: chosen(node, 'priority', lists.priorities),
    size: chosen(node, 'size', lists.sizes),
    wave: chosen(node, 'wave', lists.waves),
    labels: [
      ...new Set((Array.isArray(c.labels?.nodes) ? c.labels.nodes : []).map((l) => l?.name).filter((n) => typeof n === 'string' && n.trim() !== '')),
    ],
    updated: null,
  };
  const times = [c.updatedAt, node.updatedAt].map((t) => (typeof t === 'string' ? Date.parse(t) : NaN)).filter((t) => !Number.isNaN(t));
  if (
    item.title === '' ||
    !isRepoName(item.repo) ||
    !Number.isInteger(item.number) ||
    item.number <= 0 ||
    item.url !== boardItemUrl(item.repo, type, item.number) ||
    state === undefined ||
    times.length === 0
  ) {
    throw new BoardFetchFailure('incomplete', 'a public item on the board is not in the shape that was asked for');
  }
  item.updated = new Date(Math.max(...times)).toISOString();
  return { item };
}

/**
 * The file's content, from everything `readBoard` returned.
 *
 * `denylist` is the result of loadDenylist(): with entries, an item that contains a
 * private word is left out and counted, and a word left anywhere in the finished
 * file (the board's title, a field's option, a label on every item) throws
 * "private-word". Neither the word nor the item is ever named: only how many.
 */
export function toBoardData({ project, nodes }, { now = new Date(), denylist = {}, log = () => {} } = {}) {
  if (typeof project?.title !== 'string' || typeof project?.url !== 'string' || typeof project?.public !== 'boolean') {
    throw new BoardFetchFailure('incomplete', 'the board did not say what it is called, where it is or whether it is public');
  }
  const lists = {
    statuses: options(project.statusField),
    priorities: options(project.priorityField),
    sizes: options(project.sizeField),
    waves: options(project.waveField),
  };
  const withheld = { notPublic: 0, drafts: 0, held: 0 };
  const items = [];
  let archived = 0;
  for (const node of nodes) {
    const r = publishable(node, lists);
    if (r.skip) archived++;
    else if (r.withheld) withheld[r.withheld]++;
    else if (denylist.entries && denylistLines([r.item.title, r.item.repo, ...r.item.labels].join('\n'), denylist.entries).length > 0) withheld.held++;
    else items.push(r.item);
  }
  if (archived) log(`${archived} archived item(s) are no longer on the board and are not listed`);
  for (const [key, name] of Object.entries({ statuses: FIELD_NAMES.status, priorities: FIELD_NAMES.priority, sizes: FIELD_NAMES.size, waves: FIELD_NAMES.wave })) {
    if (lists[key].length === 0) log(`the board has no single-select field called "${name}", so no item has one`);
  }
  const data = {
    schema: BOARD_DATA_SCHEMA,
    generated: now.toISOString(),
    state: 'ok',
    project: { title: project.title.trim(), url: project.url, public: project.public },
    ...lists,
    withheld,
    items,
  };
  if (denylist.entries) {
    const lines = denylistLines(JSON.stringify(data), denylist.entries);
    if (lines.length > 0) {
      throw new BoardFetchFailure(
        'private-word',
        `the board's own names contain ${lines.length} entr${lines.length === 1 ? 'y' : 'ies'} of the private denylist (line ${lines.join(', ')} of the denylist file)`,
      );
    }
  }
  return data;
}

/** The small file a build writes when it has no board to show. */
export function unavailable(reason, now = new Date()) {
  return { schema: BOARD_DATA_SCHEMA, generated: now.toISOString(), state: 'unavailable', reason };
}

/**
 * The whole file, whatever happens: the board, or "unavailable" with the reason.
 * Returns `{ data, note }`; `note` is the sentence for the log when there is no board.
 * `graphql` is injectable so a fixture run needs no network and no token.
 */
export async function buildBoardData({ token, graphql, org = BOARD_ORG, number = BOARD_PROJECT_NUMBER, now = new Date(), denylist = {}, sleep, log = () => {} } = {}) {
  if (typeof token !== 'string' || token.trim() === '') {
    return { data: unavailable('no-token', now), note: `${TOKEN_ENV} is not set, so this build has no project board to show` };
  }
  if (denylist.error) {
    // A list that is named but cannot be read must not be mistaken for "nothing to check".
    return { data: unavailable('private-word', now), note: 'the private denylist is configured but could not be read' };
  }
  let data;
  try {
    const client = graphql ?? makeGraphql({ token: token.trim(), sleep, log });
    data = await readBoard(client, { org, number }, { sleep, log, convert: (raw) => toBoardData(raw, { now, denylist, log }) });
  } catch (e) {
    if (e instanceof BoardFetchFailure) return { data: unavailable(e.reason, now), note: e.message };
    // A bug in this script, not an answer from GitHub. Its name is safe to print; its message may not be.
    const name = typeof e?.name === 'string' && /^[A-Za-z]{1,40}$/.test(e.name) ? e.name : 'Error';
    return { data: unavailable('fetch-failed', now), note: `the board could not be read (an unexpected ${name} in the reader)` };
  }
  const errors = validateBoardData(data);
  if (errors.length > 0) {
    return {
      data: unavailable('invalid', now),
      note: `what was read does not match the shape the page reads (${errors.length} problem(s), the first: ${errors[0]})`,
    };
  }
  return { data, note: null };
}

/** One line for a person: what this build will show. */
export function summarise(data) {
  if (data.state !== 'ok') return `project board: not published by this build (${data.reason})`;
  const w = data.withheld;
  const repos = new Set(data.items.map((i) => i.repo)).size;
  return (
    `project board: ${data.items.length} items from ${repos} repositor${repos === 1 ? 'y' : 'ies'}; ` +
    `left out: ${w.notPublic} not public, ${w.drafts} draft(s), ${w.held} held back by the private-word check`
  );
}

/** A value inside a workflow command: one line, with the characters a runner would read as syntax escaped. */
export const forCommand = (s) => String(s).replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');

async function main(argv, env) {
  const arg = (name, fallback) => {
    const i = argv.indexOf(`--${name}`);
    return i === -1 ? fallback : argv[i + 1];
  };
  const out = path.resolve(ROOT, arg('out', 'src/assets/board.json'));
  const inActions = env.GITHUB_ACTIONS === 'true';
  const log = (m) => console.log(`fetch-board: ${m}`);

  const denylist = await loadDenylist(env);
  if (denylist.skipped) log('no private-word list on this machine, so that check is skipped');
  else if (denylist.entries) log(`private-word list: ${denylist.entries.length} entr${denylist.entries.length === 1 ? 'y' : 'ies'}`);

  const { data, note } = await buildBoardData({ token: env[TOKEN_ENV], denylist, log });

  await mkdir(path.dirname(out), { recursive: true });
  await writeFile(out, JSON.stringify(data) + '\n');

  const line = summarise(data);
  log(`${line} -> ${path.relative(ROOT, out)}`);
  if (note) {
    const text = `${line}: ${note}. The Project board page says so and links to GitHub.`;
    if (!inActions) console.warn(`fetch-board: ${note}`);
    // No token is the expected state of a fork, and of this repository until the
    // secret is added: a notice. Anything else is a board that should have been read.
    else console.log(`::${data.reason === 'no-token' ? 'notice' : 'warning'} title=Project board::${forCommand(text)}`);
  }
  if (env.GITHUB_STEP_SUMMARY) {
    await appendFile(env.GITHUB_STEP_SUMMARY, `**Project board.** ${line.replace(/^project board: /, '')}${note ? ` (${note})` : ''}\n\n`);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main(process.argv.slice(2), process.env).catch((e) => {
    // Only a file that cannot be written gets here: the build would have no board.json at all.
    console.error(`fetch-board: FAILED: ${e?.message ?? e}`);
    process.exit(1);
  });
}
