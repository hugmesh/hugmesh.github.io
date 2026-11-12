import { BOARD_ORG, type BoardAvailable, type BoardItem } from './board-data';

/**
 * What the Project board page shows, worked out from the data: the order of the
 * groups, which rows a filter keeps, and the order of rows inside a group. Pure
 * functions, so the rules can be tested without rendering anything.
 *
 * STATUS NAMES ARE THE BOARD'S. The page lists every status the file names, so a
 * column added or renamed on GitHub shows up by itself. Only two decisions need a
 * name written here, and both fall back sensibly when the name is not on the board:
 * which statuses are listed FIRST, and which are FOLDED AWAY until asked for.
 */

/** Open work, most active first. These lead the page, in this order. */
export const OPEN_FIRST: readonly string[] = ['In progress', 'Ready for testing', 'Todo'];
/** Finished work. Listed last and folded away, with its count, until opened. */
export const FINISHED: readonly string[] = ['Done testing', 'Accepted'];

/** A filter that keeps everything. */
export const ALL = '';
/** A filter that keeps the items with NO value for that field. */
export const NONE = 'none';
/** A filter that keeps one named value. Prefixed, so no name can collide with ALL or NONE. */
export const is = (name: string): string => `is:${name}`;

export interface BoardFilters {
  /** Words that must all appear in the title, the repository and number, or a label. */
  readonly q: string;
  readonly status: string;
  readonly priority: string;
  readonly wave: string;
  readonly repo: string;
}

export const NO_FILTERS: BoardFilters = { q: '', status: ALL, priority: ALL, wave: ALL, repo: ALL };

export function filtersActive(f: BoardFilters): boolean {
  return f.q.trim() !== '' || f.status !== ALL || f.priority !== ALL || f.wave !== ALL || f.repo !== ALL;
}

/** One item, with what the page needs worked out once instead of on every keystroke. */
export interface BoardRow {
  readonly item: BoardItem;
  /** "hugmesh-generator#314": the repository without the organisation when it is this one. */
  readonly ref: string;
  /** Lower-case text the Find field searches. */
  readonly hay: string;
}

export interface BoardGroup {
  /** The status name, or null for items that have none. */
  readonly status: string | null;
  readonly label: string;
  /** Stable for one data file: used for the element id the heading button controls. */
  readonly id: string;
  /** Rows the filters keep, most urgent first. */
  readonly rows: readonly BoardRow[];
  /** How many items have this status before any filter. */
  readonly total: number;
  /** Folded away unless a filter is on or the reader opens it. */
  readonly finished: boolean;
}

export const NO_STATUS_LABEL = 'No status';

/** A repository as the page names it: without "hugmesh/", in full when it is someone else's. */
export function shortRepo(repo: string): string {
  const prefix = `${BOARD_ORG}/`;
  return repo.startsWith(prefix) ? repo.slice(prefix.length) : repo;
}

function choiceKeeps(choice: string, value: string | null): boolean {
  if (choice === ALL) return true;
  if (choice === NONE) return value === null;
  return value !== null && choice === is(value);
}

/** The words of a Find query: lower-case, split on spaces, empty ones dropped. */
export function terms(q: string): string[] {
  return q.toLowerCase().split(/\s+/).filter(Boolean);
}

export function rowMatches(row: BoardRow, f: BoardFilters, words: readonly string[] = terms(f.q)): boolean {
  const i = row.item;
  return (
    choiceKeeps(f.status, i.status) &&
    choiceKeeps(f.priority, i.priority) &&
    choiceKeeps(f.wave, i.wave) &&
    choiceKeeps(f.repo, i.repo) &&
    words.every((w) => row.hay.includes(w))
  );
}

/**
 * Every item as a row, in the order rows are shown inside a group: the board's
 * priorities in the board's order (an item with none goes last), then the most
 * recently changed first, then by repository and number so the order never jumps
 * between two visits when nothing changed.
 */
export function prepareRows(data: BoardAvailable): BoardRow[] {
  const rank = (i: BoardItem) => {
    const at = i.priority === null ? -1 : data.priorities.indexOf(i.priority);
    return at === -1 ? data.priorities.length : at;
  };
  return data.items
    .map((item): BoardRow => {
      const ref = `${shortRepo(item.repo)}#${item.number}`;
      return { item, ref, hay: [item.title, ref, `${item.repo}#${item.number}`, ...item.labels].join('\n').toLowerCase() };
    })
    .sort(
      (a, b) =>
        rank(a.item) - rank(b.item) ||
        Date.parse(b.item.updated) - Date.parse(a.item.updated) ||
        a.item.repo.localeCompare(b.item.repo) ||
        a.item.number - b.item.number,
    );
}

/**
 * The order of the groups on the page: open work first (OPEN_FIRST, in that order),
 * then any status this page has no opinion about in the board's own order, then
 * items with no status, then finished work in the board's own order.
 */
export function groupOrder(statuses: readonly string[], hasUnset: boolean): (string | null)[] {
  const open = OPEN_FIRST.filter((s) => statuses.includes(s));
  const finished = statuses.filter((s) => FINISHED.includes(s));
  const other = statuses.filter((s) => !open.includes(s) && !finished.includes(s));
  return [...open, ...other, ...(hasUnset ? [null] : []), ...finished];
}

/** The groups that have at least one row left, in page order. */
export function groupRows(data: BoardAvailable, rows: readonly BoardRow[], f: BoardFilters): BoardGroup[] {
  const words = terms(f.q);
  const hasUnset = rows.some((r) => r.item.status === null);
  return groupOrder(data.statuses, hasUnset)
    .map((status): BoardGroup => {
      const mine = rows.filter((r) => r.item.status === status);
      return {
        status,
        label: status ?? NO_STATUS_LABEL,
        id: `board-group-${status === null ? 'none' : data.statuses.indexOf(status)}`,
        rows: mine.filter((r) => rowMatches(r, f, words)),
        total: mine.length,
        finished: status !== null && FINISHED.includes(status),
      };
    })
    .filter((g) => g.rows.length > 0);
}

export interface StatusCount {
  readonly label: string;
  readonly count: number;
}

/**
 * How many listed items each status has, in THE BOARD'S OWN ORDER: this is the
 * board's row of columns, so a status with nothing in it is still named.
 */
export function statusCounts(data: BoardAvailable): StatusCount[] {
  const counts = data.statuses.map((label) => ({ label, count: data.items.filter((i) => i.status === label).length }));
  const unset = data.items.filter((i) => i.status === null).length;
  return unset > 0 ? [...counts, { label: NO_STATUS_LABEL, count: unset }] : counts;
}

export interface FilterOption {
  readonly value: string;
  readonly label: string;
}

/**
 * The choices of one filter: everything, each of the board's names in the board's
 * order, and "none" only when some item really has none (a choice that can never
 * match anything is not offered).
 */
export function fieldOptions(names: readonly string[], values: readonly (string | null)[], all: string, none: string): FilterOption[] {
  return [
    { value: ALL, label: all },
    ...names.map((n) => ({ value: is(n), label: n })),
    ...(values.some((v) => v === null) ? [{ value: NONE, label: none }] : []),
  ];
}

/** Every repository that has an item listed, by the name the rows use. */
export function repoOptions(data: BoardAvailable): FilterOption[] {
  const repos = [...new Set(data.items.map((i) => i.repo))].sort((a, b) => shortRepo(a).localeCompare(shortRepo(b)));
  return [{ value: ALL, label: 'All repositories' }, ...repos.map((r) => ({ value: is(r), label: shortRepo(r) }))];
}
