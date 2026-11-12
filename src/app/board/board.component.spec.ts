import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { BOARD_DATA_SCHEMA, BOARD_URL, type BoardAvailable, type BoardItem, boardItemUrl } from './board-data';
import { BoardComponent } from './board.component';
// Written by scripts/fetch-board.mjs from recorded GraphQL answers
// (scripts/fetch-board.test.mjs checks that), so the page is tested on what the
// build really writes.
import fixture from './testing/board.fixture.json';

const board = fixture as unknown as BoardAvailable;
const HOSTILE = board.items.find((i) => i.title.includes('<img'))!;

/** A board of `n` items, for the size of the real one and more. */
function bigBoard(n: number): BoardAvailable {
  const items: BoardItem[] = [];
  for (let i = 1; i <= n; i++) {
    const repo = `hugmesh/repo-${i % 25}`;
    const type = i % 7 === 0 ? 'pull' : 'issue';
    items.push({
      title: `Item number ${i}: a title of a usual length for an issue on the board`,
      type,
      repo,
      number: i,
      url: boardItemUrl(repo, type, i),
      state: i % 3 === 0 ? 'closed' : 'open',
      status: board.statuses[i % board.statuses.length],
      priority: board.priorities[i % board.priorities.length],
      size: board.sizes[i % board.sizes.length],
      wave: board.waves[i % board.waves.length],
      labels: i % 2 ? ['bug'] : ['enhancement', 'ui'],
      updated: new Date(Date.UTC(2026, 9, 1) + i * 60_000).toISOString(),
    });
  }
  return { ...board, items };
}

describe('BoardComponent', () => {
  let fixtureRef: ComponentFixture<BoardComponent>;
  let http: HttpTestingController;
  /** Karma runs the specs in an iframe; its width is the viewport the page sees. */
  const frame = window.frameElement as HTMLElement | null;
  const frameWidth = frame?.style.width ?? '';

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [BoardComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
    fixtureRef = TestBed.createComponent(BoardComponent);
    fixtureRef.detectChanges();
  });

  afterEach(() => {
    http.verify();
    if (frame) frame.style.width = frameWidth;
  });

  function serve(body: unknown, status = 200): HTMLElement {
    const req = http.expectOne('assets/board.json');
    if (status === 200) req.flush(body as object);
    else req.flush('', { status, statusText: 'Not Found' });
    fixtureRef.detectChanges();
    return fixtureRef.nativeElement as HTMLElement;
  }

  const text = (el: Element | null) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
  const groups = (el: HTMLElement) => Array.from(el.querySelectorAll<HTMLElement>('section.group'));
  const groupNamed = (el: HTMLElement, label: string) => groups(el).find((g) => g.dataset['status'] === label)!;
  const toggleOf = (g: HTMLElement) => g.querySelector<HTMLButtonElement>('.group-toggle')!;
  const titles = (el: HTMLElement) => Array.from(el.querySelectorAll('.row-title')).map((a) => text(a));
  const choose = (el: HTMLElement, testid: string, value: string) => {
    const select = el.querySelector<HTMLSelectElement>(`[data-testid="${testid}"]`)!;
    select.value = value;
    select.dispatchEvent(new Event('change'));
    fixtureRef.detectChanges();
  };
  const find = (el: HTMLElement, q: string) => {
    const input = el.querySelector<HTMLInputElement>('[data-testid="board-find"]')!;
    input.value = q;
    input.dispatchEvent(new Event('input'));
    fixtureRef.detectChanges();
  };

  it('says it is loading until the file arrives', () => {
    expect(text(fixtureRef.nativeElement.querySelector('[role="status"]'))).toContain('Loading the board');
    serve(board);
  });

  describe('with a board', () => {
    let el: HTMLElement;
    beforeEach(() => (el = serve(board)));

    it('says what the page is, and when the board was read', () => {
      expect(text(el.querySelector('h1'))).toBe('Project board');
      expect(text(el.querySelector('.lede'))).toContain('copy of the project board on GitHub');
      expect(el.querySelector('[data-testid="board-updated"]')!.getAttribute('datetime')).toBe(board.generated);
      expect(el.querySelector('[data-testid="board-on-github"]')!.getAttribute('href')).toBe(board.project.url);
      expect(text(el.querySelector('[data-testid="board-left-out"]'))).toBe(
        'Not listed here: 3 items in a repository that is not public and 1 draft note.',
      );
    });

    it('counts each status in the board\'s own order', () => {
      const counts = Array.from(el.querySelectorAll('[data-testid="status-counts"] li')).map((li) => text(li));
      const expected = board.statuses.map((s) => `${board.items.filter((i) => i.status === s).length} ${s}`);
      expect(counts).toEqual([...expected, `${board.items.filter((i) => i.status === null).length} No status`]);
    });

    it('groups open work first and folds finished work away with its count, rows not even in the document', () => {
      expect(groups(el).map((g) => g.dataset['status'])).toEqual([
        'In progress',
        'Ready for testing',
        'Todo',
        'Proposed',
        'No status',
        'Done testing',
        'Accepted',
      ]);
      const done = groupNamed(el, 'Done testing');
      expect(toggleOf(done).getAttribute('aria-expanded')).toBe('false');
      expect(done.querySelectorAll('.row').length).toBe(0);
      const doneCount = board.items.filter((i) => i.status === 'Done testing').length;
      expect(text(done.querySelector('[data-testid="group-count"]'))).toBe(`${doneCount} items`);
      const todo = groupNamed(el, 'Todo');
      expect(toggleOf(todo).getAttribute('aria-expanded')).toBe('true');
      expect(todo.querySelectorAll('.row').length).toBe(board.items.filter((i) => i.status === 'Todo').length);
    });

    it('opens and folds a group from its heading button, which names the region it controls', () => {
      const done = groupNamed(el, 'Done testing');
      const button = toggleOf(done);
      expect(done.querySelector(`#${button.getAttribute('aria-controls')}`)).not.toBeNull();
      button.click();
      fixtureRef.detectChanges();
      expect(button.getAttribute('aria-expanded')).toBe('true');
      expect(done.querySelectorAll('.row').length).toBe(board.items.filter((i) => i.status === 'Done testing').length);
      button.click();
      fixtureRef.detectChanges();
      expect(done.querySelectorAll('.row').length).toBe(0);
    });

    it('renders each row as a link to the item on GitHub with its reference, priority, size and wave', () => {
      const item = board.items.find((i) => i.repo === 'hugmesh/example-api' && i.number === 12)!;
      const link = Array.from(el.querySelectorAll<HTMLAnchorElement>('.row-title')).find((a) => text(a) === item.title)!;
      expect(link.getAttribute('href')).toBe(item.url);
      expect(link.getAttribute('rel')).toContain('noopener');
      const meta = text(link.closest('.row')!.querySelector('.row-meta'));
      expect(meta).toContain('example-api#12');
      expect(meta).toContain(item.priority!);
      expect(meta).toContain(`Size ${item.size}`);
      expect(meta).toContain(`Wave ${item.wave}`);
    });

    it('shows a hostile title as the text it is: no element is created from it', () => {
      const row = Array.from(el.querySelectorAll<HTMLAnchorElement>('.row-title')).find((a) => a.textContent === HOSTILE.title);
      expect(row).withContext('the title is rendered character for character').toBeDefined();
      expect(row!.children.length).toBe(0);
      expect(el.querySelector('img')).toBeNull();
      expect(el.querySelector('[onerror]')).toBeNull();
    });

    it('filters by status, priority, wave and repository, and says how many match', () => {
      choose(el, 'board-status', 'is:Todo');
      expect(groups(el).map((g) => g.dataset['status'])).toEqual(['Todo']);
      const todo = board.items.filter((i) => i.status === 'Todo').length;
      expect(text(el.querySelector('[data-testid="board-summary"]'))).toBe(`${todo} of ${board.items.length} items match.`);
      choose(el, 'board-status', '');
      choose(el, 'board-priority', 'is:P1 High');
      expect(titles(el).length).toBe(board.items.filter((i) => i.priority === 'P1 High').length);
      choose(el, 'board-priority', '');
      choose(el, 'board-wave', 'is:W1');
      expect(titles(el).length).toBe(board.items.filter((i) => i.wave === 'W1').length);
      choose(el, 'board-wave', '');
      choose(el, 'board-repo', 'is:example-org/shared-lib');
      expect(titles(el)).toEqual(board.items.filter((i) => i.repo === 'example-org/shared-lib').map((i) => i.title));
    });

    it('opens a finished group while a filter is on, so a match is never hidden in a fold', () => {
      const done = board.items.find((i) => i.status === 'Done testing')!;
      find(el, done.title.split(' ').slice(0, 4).join(' '));
      expect(titles(el)).toContain(done.title);
      expect(toggleOf(groupNamed(el, 'Done testing')).getAttribute('aria-expanded')).toBe('true');
    });

    it('finds by text, says when nothing matches, and Clear filters brings the whole board back', () => {
      find(el, 'nothing on this board looks like this');
      expect(el.querySelector('[data-testid="board-empty"]')).not.toBeNull();
      expect(text(el.querySelector('[data-testid="board-summary"]'))).toBe(`Nothing matches. ${board.items.length} items in all.`);
      el.querySelector<HTMLButtonElement>('[data-testid="board-clear"]')!.click();
      fixtureRef.detectChanges();
      expect(el.querySelector('[data-testid="board-clear"]')).toBeNull();
      expect(groups(el).length).toBe(7);
      expect(document.activeElement).toBe(el.querySelector('[data-testid="board-find"]'));
    });

    it('labels every filter, so each can be reached and named with a keyboard and a screen reader', () => {
      for (const control of Array.from(el.querySelectorAll<HTMLElement>('.filters input, .filters select'))) {
        expect(el.querySelector(`label[for="${control.id}"]`)).withContext(control.id).not.toBeNull();
      }
      for (const b of Array.from(el.querySelectorAll<HTMLButtonElement>('.group-toggle'))) {
        expect(b.type).toBe('button');
        expect(b.closest('h2')).withContext('each group toggle is the group heading').not.toBeNull();
      }
    });
  });

  it('with no token at build time, says the board is not published here yet and links to GitHub', () => {
    const el = serve({ schema: BOARD_DATA_SCHEMA, generated: '2026-11-01T08:00:00Z', state: 'unavailable', reason: 'no-token' });
    const notice = el.querySelector('[data-testid="board-unavailable"]')!;
    expect(text(notice.querySelector('h2'))).toBe('The board is not published here yet');
    expect(notice.querySelector('a')!.getAttribute('href')).toBe(BOARD_URL);
    expect(el.querySelector('.row')).toBeNull();
  });

  it('with no file at all, says the same', () => {
    const el = serve(null, 404);
    expect(text(el.querySelector('[data-testid="board-unavailable"] h2'))).toBe('The board is not published here yet');
  });

  it('when the build could not read the board whole, says so instead of showing part of it', () => {
    const el = serve({ schema: BOARD_DATA_SCHEMA, generated: '2026-11-01T08:00:00Z', state: 'unavailable', reason: 'incomplete' });
    expect(text(el.querySelector('[data-testid="board-unavailable"] h2'))).toBe('The board could not be read');
    expect(el.querySelector('[data-testid="board-unavailable"] a')!.getAttribute('href')).toBe(BOARD_URL);
  });

  it('with a file of another schema version, says the page is out of date and shows nothing', () => {
    const el = serve({ ...board, schema: BOARD_DATA_SCHEMA + 1 });
    expect(el.querySelector('[data-testid="board-other-version"]')).not.toBeNull();
    expect(text(el.querySelector('[data-testid="board-other-version"]'))).toContain('Reload the page');
    expect(el.querySelector('.row')).toBeNull();
  });

  it('with a damaged file, shows nothing and links to GitHub', () => {
    const el = serve({ ...board, items: [{ ...board.items[0], body: 'a body is never published' }] });
    expect(el.querySelector('[data-testid="board-invalid"] a')!.getAttribute('href')).toBe(BOARD_URL);
    expect(el.querySelector('.row')).toBeNull();
  });

  it('renders a board of 520 items quickly, and only the open groups\' rows', () => {
    const big = bigBoard(520);
    const started = performance.now();
    const el = serve(big);
    const took = performance.now() - started;
    const open = big.items.filter((i) => !['Done testing', 'Accepted'].includes(i.status!)).length;
    expect(el.querySelectorAll('.row').length).toBe(open);
    expect(took).withContext(`first render took ${Math.round(took)} ms`).toBeLessThan(1500);
    const t2 = performance.now();
    find(el, 'number 51');
    expect(performance.now() - t2).withContext('a keystroke in Find').toBeLessThan(500);
  });

  // No sideways scrolling on a phone, nothing cut off on a desktop.
  for (const width of [390, 1280]) {
    it(`fits ${width}px wide without sideways scrolling, every group open`, () => {
      if (!frame) {
        pending('needs the Karma iframe to set the viewport width');
        return;
      }
      frame.style.width = `${width}px`;
      expect(window.innerWidth).withContext('the spec frame took the width').toBe(width);
      const el = serve(board);
      for (const g of groups(el)) {
        if (toggleOf(g).getAttribute('aria-expanded') !== 'true') toggleOf(g).click();
      }
      fixtureRef.detectChanges();
      const main = el.querySelector<HTMLElement>('main')!;
      expect(main.scrollWidth).withContext('the page is no wider than its box').toBeLessThanOrEqual(main.clientWidth);
      const vw = document.documentElement.clientWidth;
      const checked = Array.from(
        el.querySelectorAll<HTMLElement>('h1, .lede, .counts li, .filters input, .filters select, .group-toggle, .row-title, .tag, .label, .ref'),
      );
      expect(checked.length).toBeGreaterThan(30);
      for (const node of checked) {
        const r = node.getBoundingClientRect();
        const label = `${node.className || node.tagName} "${text(node).slice(0, 30)}" at ${width}px`;
        expect(r.right).withContext(`${label}: right edge`).toBeLessThanOrEqual(vw + 0.5);
        expect(r.left).withContext(`${label}: left edge`).toBeGreaterThanOrEqual(-0.5);
      }
      // Touch-sized controls on a phone.
      for (const c of Array.from(el.querySelectorAll<HTMLElement>('.filters input, .filters select, .group-toggle'))) {
        expect(c.getBoundingClientRect().height).withContext(`${c.id || c.className} height`).toBeGreaterThanOrEqual(43.5);
      }
    });
  }
});
