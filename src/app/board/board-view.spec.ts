import { type BoardAvailable, type BoardItem, validateBoardData } from './board-data';
import {
  ALL,
  NO_FILTERS,
  NONE,
  fieldOptions,
  groupOrder,
  groupRows,
  is,
  prepareRows,
  repoOptions,
  shortRepo,
  statusCounts,
} from './board-view';
// Written by scripts/fetch-board.mjs from recorded GraphQL answers, and checked
// against its output by scripts/fetch-board.test.mjs.
import fixture from './testing/board.fixture.json';

const data = fixture as unknown as BoardAvailable;

describe('board fixture', () => {
  it('is valid board data, by the validator the page and the build both run', () => {
    expect(validateBoardData(fixture)).toEqual([]);
  });
});

describe('board view rules', () => {
  const rows = prepareRows(data);
  const labels = (f = NO_FILTERS) => groupRows(data, rows, f).map((g) => g.label);
  const refs = (f = NO_FILTERS) => groupRows(data, rows, f).flatMap((g) => g.rows.map((r) => r.ref));

  it('puts open work first, then statuses it has no opinion about, then no status, then finished work', () => {
    expect(groupOrder(data.statuses, true)).toEqual([
      'In progress',
      'Ready for testing',
      'Todo',
      'Proposed',
      null,
      'Done testing',
      'Accepted',
    ]);
    expect(groupOrder(['Todo', 'Done testing'], false)).toEqual(['Todo', 'Done testing']);
    expect(labels()).toEqual(['In progress', 'Ready for testing', 'Todo', 'Proposed', 'No status', 'Done testing', 'Accepted']);
  });

  it('marks only the finished groups as folded by default', () => {
    const finished = groupRows(data, rows, NO_FILTERS)
      .filter((g) => g.finished)
      .map((g) => g.label);
    expect(finished).toEqual(['Done testing', 'Accepted']);
  });

  it('orders rows inside a group by the board\'s priority order, then by the most recent change', () => {
    const p = (r: { item: BoardItem }) => r.item.priority;
    for (const g of groupRows(data, rows, NO_FILTERS)) {
      const ranks = g.rows.map((r) => (p(r) === null ? data.priorities.length : data.priorities.indexOf(p(r)!)));
      expect(ranks).withContext(g.label).toEqual([...ranks].sort((a, b) => a - b));
    }
  });

  it('counts every status in the board\'s own order, with a status that has nothing still named', () => {
    const counts = statusCounts(data);
    expect(counts.map((c) => c.label)).toEqual([...data.statuses, 'No status']);
    expect(counts.reduce((n, c) => n + c.count, 0)).toBe(data.items.length);
  });

  it('filters by status, priority, wave and repository, and "none" keeps the items without a value', () => {
    expect(refs({ ...NO_FILTERS, status: is('Todo') }).length).toBe(data.items.filter((i) => i.status === 'Todo').length);
    expect(labels({ ...NO_FILTERS, status: NONE })).toEqual(['No status']);
    const p1 = refs({ ...NO_FILTERS, priority: is('P1 High') });
    expect(p1.length).toBe(data.items.filter((i) => i.priority === 'P1 High').length);
    expect(refs({ ...NO_FILTERS, wave: is('W1') }).length).toBe(data.items.filter((i) => i.wave === 'W1').length);
    const other = refs({ ...NO_FILTERS, repo: is('example-org/shared-lib') });
    const lib = data.items.find((i) => i.repo === 'example-org/shared-lib')!;
    expect(other).toEqual([`example-org/shared-lib#${lib.number}`]);
  });

  it('finds by every word of the text filter, in a title, a reference or a label, ignoring case', () => {
    expect(refs({ ...NO_FILTERS, q: 'SIGN-IN language' }).length).toBe(1);
    expect(refs({ ...NO_FILTERS, q: 'example-api#12' })).toEqual(['example-api#12']);
    expect(refs({ ...NO_FILTERS, q: 'sign-in nothing-like-this' })).toEqual([]);
    expect(labels({ ...NO_FILTERS, q: 'zzz-no-match' })).toEqual([]);
  });

  it('names a repository of this organisation without the organisation, and anyone else\'s in full', () => {
    expect(shortRepo('hugmesh/example-api')).toBe('example-api');
    expect(shortRepo('example-org/shared-lib')).toBe('example-org/shared-lib');
    expect(repoOptions(data)[0]).toEqual({ value: ALL, label: 'All repositories' });
  });

  it('offers "none" only when some item really has none', () => {
    expect(fieldOptions(['A'], ['A'], 'All', 'None').map((o) => o.value)).toEqual([ALL, is('A')]);
    expect(fieldOptions(['A'], ['A', null], 'All', 'None').map((o) => o.value)).toEqual([ALL, is('A'), NONE]);
  });

  it('cannot confuse a status called "none" with the "no value" choice', () => {
    expect(is('none')).not.toBe(NONE);
    expect(is('')).not.toBe(ALL);
  });
});
