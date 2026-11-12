/**
 * The shape of `assets/board.json`, and the one validator for it.
 *
 * WHO WRITES IT. Nobody by hand. `scripts/fetch-board.mjs` builds it during the
 * Pages build from the GitHub project board, validates it with `validateBoardData`
 * below, and writes an "unavailable" file instead of anything that fails. The
 * Project board page validates the file again when it loads it.
 *
 * WHAT MAY BE IN IT. A small, fixed copy of each item: title, kind, repository,
 * number, address, open or closed, and four of the board's fields. Nothing else:
 * no bodies, no comments, no assignees, no free-text field, and no item from a
 * repository that is not public. The validator REJECTS A KEY IT DOES NOT KNOW, on
 * the file and on every item, so publishing one more field means changing this
 * file on purpose, never a stray property that rode along.
 *
 * WHY ONE FILE FOR BOTH. The generator is Node and the page is Angular. Node runs
 * this file directly (type stripping), so it must stay free of imports and of
 * syntax that is not erasable: no enums, no namespaces, no parameter properties.
 *
 * NAMES ARE DATA. The status, priority, size and wave names come from the board.
 * An item's value is checked against the lists in the same file, never against a
 * list written here, so renaming a column on GitHub cannot make the file invalid.
 */

/**
 * Raise this whenever the shape changes. A page that reads a file with another
 * number says so plainly and shows nothing, instead of rendering a shape it was
 * not written for (a browser can hold an older page than the file it fetches).
 */
export const BOARD_DATA_SCHEMA = 1;

/** Which board: the organisation's GitHub Project, by number. */
export const BOARD_ORG = 'hugmesh';
export const BOARD_PROJECT_NUMBER = 1;
/** The board's own page on GitHub, for the states where this site shows no list. */
export const BOARD_URL = `https://github.com/orgs/${BOARD_ORG}/projects/${BOARD_PROJECT_NUMBER}`;

export type BoardItemType = 'issue' | 'pull';
export type BoardItemState = 'open' | 'closed' | 'merged';

/** One issue or pull request on the board, from a public repository. */
export interface BoardItem {
  readonly title: string;
  readonly type: BoardItemType;
  /** owner/name */
  readonly repo: string;
  readonly number: number;
  /** Always `boardItemUrl(repo, type, number)`: the validator refuses anything else. */
  readonly url: string;
  readonly state: BoardItemState;
  /** One of `statuses`, or null when the item has no status on the board. */
  readonly status: string | null;
  readonly priority: string | null;
  readonly size: string | null;
  readonly wave: string | null;
  readonly labels: readonly string[];
  /** ISO 8601: when the item, or its place on the board, last changed. */
  readonly updated: string;
}

/** How many items the board holds that this file leaves out. Counts only. */
export interface BoardWithheld {
  /** In a repository that is not public, or not readable with the build's token. */
  readonly notPublic: number;
  /** Draft items: notes on the board that are not an issue or a pull request. */
  readonly drafts: number;
  /** Held back by the site's private-word check (scripts/lib/denylist.mjs). */
  readonly held: number;
}

export interface BoardProject {
  readonly title: string;
  readonly url: string;
  /** False when the board itself is private on GitHub: the page then does not link it. */
  readonly public: boolean;
}

export interface BoardAvailable {
  readonly schema: number;
  /** ISO 8601 time the board was read. */
  readonly generated: string;
  readonly state: 'ok';
  readonly project: BoardProject;
  /** The board's own names, each in the board's own order. */
  readonly statuses: readonly string[];
  readonly priorities: readonly string[];
  readonly sizes: readonly string[];
  readonly waves: readonly string[];
  readonly withheld: BoardWithheld;
  readonly items: readonly BoardItem[];
}

/**
 * Why a build wrote no board. A fixed list, because the file is public: never a
 * message from GitHub, which could describe the token.
 *
 *   no-token      the build had no BOARD_READ_TOKEN (a fork, a pull request, or the
 *                 secret has not been added yet)
 *   unauthorized  GitHub refused the token, or the token cannot see the board
 *   fetch-failed  the network, a server error, a rate limit or an unreadable answer
 *   incomplete    part of the board arrived and part did not
 *   private-word  the private-word check found a word in the board's own names
 *   invalid       what was built does not match this file (a bug in the generator)
 */
export const BOARD_UNAVAILABLE_REASONS = [
  'no-token',
  'unauthorized',
  'fetch-failed',
  'incomplete',
  'private-word',
  'invalid',
] as const;
export type BoardUnavailableReason = (typeof BOARD_UNAVAILABLE_REASONS)[number];

export interface BoardUnavailable {
  readonly schema: number;
  readonly generated: string;
  readonly state: 'unavailable';
  readonly reason: BoardUnavailableReason;
}

export type BoardData = BoardAvailable | BoardUnavailable;

/** The only address an item may carry: its issue or pull request on github.com. */
export function boardItemUrl(repo: string, type: BoardItemType, number: number): string {
  return `https://github.com/${repo}/${type === 'pull' ? 'pull' : 'issues'}/${number}`;
}

// ── validation ───────────────────────────────────────────────────────────────

/** One path segment of owner/name: GitHub's characters, and never "." or "..". */
const NAME = /^(?!\.+$)[A-Za-z0-9_.-]+$/;
const PROJECT_URL = /^https:\/\/github\.com\/orgs\/[A-Za-z0-9_.-]+\/projects\/[1-9]\d*$/;
/** Far above anything GitHub allows (256 for a title, 50 for a label): a sanity bound. */
const MAX_TEXT = 1024;

const FILE_KEYS_OK = ['schema', 'generated', 'state', 'project', 'statuses', 'priorities', 'sizes', 'waves', 'withheld', 'items'];
const FILE_KEYS_UNAVAILABLE = ['schema', 'generated', 'state', 'reason'];
const PROJECT_KEYS = ['title', 'url', 'public'];
const WITHHELD_KEYS = ['notPublic', 'drafts', 'held'];
const ITEM_KEYS = ['title', 'type', 'repo', 'number', 'url', 'state', 'status', 'priority', 'size', 'wave', 'labels', 'updated'];

type Obj = Record<string, unknown>;

function isObj(v: unknown): v is Obj {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isText(v: unknown): v is string {
  return typeof v === 'string' && v.trim() !== '' && v.length <= MAX_TEXT;
}

function isTime(v: unknown): boolean {
  return typeof v === 'string' && !Number.isNaN(Date.parse(v));
}

export function isRepoName(v: unknown): v is string {
  if (typeof v !== 'string') return false;
  const parts = v.split('/');
  return parts.length === 2 && parts.every((p) => NAME.test(p));
}

/** Exactly these keys: a missing one and an extra one are both errors. */
function keys(o: Obj, allowed: readonly string[], where: string, errors: string[]): void {
  for (const k of Object.keys(o)) {
    if (!allowed.includes(k)) errors.push(`${where} has a key this site does not publish: ${k}`);
  }
  for (const k of allowed) {
    if (!(k in o)) errors.push(`${where}.${k} is missing`);
  }
}

/** A list of distinct names, or null when it is not one. */
function names(data: Obj, field: string, errors: string[]): readonly string[] | null {
  const v = data[field];
  if (!Array.isArray(v) || v.some((n) => !isText(n))) {
    errors.push(`${field} must be a list of names`);
    return null;
  }
  if (new Set(v).size !== v.length) errors.push(`${field} lists a name twice`);
  return v as string[];
}

function oneOf(o: Obj, key: string, list: readonly string[] | null, listName: string, where: string, errors: string[]): void {
  const v = o[key];
  if (v === null) return;
  if (typeof v !== 'string' || (list !== null && !list.includes(v))) {
    errors.push(`${where}.${key} must be null or one of ${listName}`);
  }
}

function item(v: unknown, where: string, lists: Record<string, readonly string[] | null>, errors: string[]): void {
  if (!isObj(v)) {
    errors.push(`${where} must be an object`);
    return;
  }
  keys(v, ITEM_KEYS, where, errors);
  if (!isText(v['title'])) errors.push(`${where}.title must be a non-empty string`);
  const type = v['type'];
  if (type !== 'issue' && type !== 'pull') errors.push(`${where}.type must be "issue" or "pull"`);
  const repo = v['repo'];
  if (!isRepoName(repo)) errors.push(`${where}.repo must be owner/name`);
  const number = v['number'];
  if (typeof number !== 'number' || !Number.isInteger(number) || number <= 0) {
    errors.push(`${where}.number must be a positive whole number`);
  }
  if (
    (type === 'issue' || type === 'pull') &&
    isRepoName(repo) &&
    typeof number === 'number' &&
    v['url'] !== boardItemUrl(repo, type, number)
  ) {
    errors.push(`${where}.url must be the item's own address on github.com`);
  }
  const state = v['state'];
  if (state !== 'open' && state !== 'closed' && !(state === 'merged' && type === 'pull')) {
    errors.push(`${where}.state must be "open" or "closed" (or "merged" for a pull request)`);
  }
  oneOf(v, 'status', lists['statuses'], 'statuses', where, errors);
  oneOf(v, 'priority', lists['priorities'], 'priorities', where, errors);
  oneOf(v, 'size', lists['sizes'], 'sizes', where, errors);
  oneOf(v, 'wave', lists['waves'], 'waves', where, errors);
  const labels = v['labels'];
  if (!Array.isArray(labels) || labels.some((l) => !isText(l))) errors.push(`${where}.labels must be a list of names`);
  if (!isTime(v['updated'])) errors.push(`${where}.updated must be an ISO 8601 time`);
}

/**
 * Every way `data` fails to be a BoardData the page can render, as plain
 * sentences. An empty list means valid.
 */
export function validateBoardData(data: unknown): string[] {
  const errors: string[] = [];
  if (!isObj(data)) return ['the file is not a JSON object'];
  if (data['schema'] !== BOARD_DATA_SCHEMA) errors.push(`schema must be ${BOARD_DATA_SCHEMA}`);
  if (!isTime(data['generated'])) errors.push('generated must be an ISO 8601 time');

  if (data['state'] === 'unavailable') {
    // An "unavailable" file is small on purpose: it must not be able to carry items.
    keys(data, FILE_KEYS_UNAVAILABLE, 'the file', errors);
    if (!(BOARD_UNAVAILABLE_REASONS as readonly unknown[]).includes(data['reason'])) {
      errors.push('reason is not one this site knows');
    }
    return errors;
  }
  if (data['state'] !== 'ok') {
    errors.push('state must be "ok" or "unavailable"');
    return errors;
  }

  keys(data, FILE_KEYS_OK, 'the file', errors);

  const project = data['project'];
  if (!isObj(project)) {
    errors.push('project must be an object');
  } else {
    keys(project, PROJECT_KEYS, 'project', errors);
    if (!isText(project['title'])) errors.push('project.title must be a non-empty string');
    if (typeof project['url'] !== 'string' || !PROJECT_URL.test(project['url'])) {
      errors.push('project.url must be a GitHub organisation project address');
    }
    if (typeof project['public'] !== 'boolean') errors.push('project.public must be true or false');
  }

  const lists: Record<string, readonly string[] | null> = {
    statuses: names(data, 'statuses', errors),
    priorities: names(data, 'priorities', errors),
    sizes: names(data, 'sizes', errors),
    waves: names(data, 'waves', errors),
  };

  const withheld = data['withheld'];
  if (!isObj(withheld)) {
    errors.push('withheld must be an object');
  } else {
    keys(withheld, WITHHELD_KEYS, 'withheld', errors);
    for (const k of WITHHELD_KEYS) {
      const n = withheld[k];
      if (k in withheld && (typeof n !== 'number' || !Number.isInteger(n) || n < 0)) {
        errors.push(`withheld.${k} must be a whole number, zero or more`);
      }
    }
  }

  const items = data['items'];
  if (!Array.isArray(items)) {
    errors.push('items must be a list');
    return errors;
  }
  const seen = new Set<string>();
  items.forEach((it, i) => {
    item(it, `items[${i}]`, lists, errors);
    if (isObj(it)) {
      const key = `${String(it['repo'])}#${String(it['number'])}`;
      if (seen.has(key)) errors.push(`items[${i}] (${key}) is listed twice`);
      seen.add(key);
    }
  });
  return errors;
}

export function isBoardData(data: unknown): data is BoardData {
  return validateBoardData(data).length === 0;
}
