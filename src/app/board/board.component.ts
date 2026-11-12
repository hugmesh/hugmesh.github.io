import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { BOARD_URL } from './board-data';
import { BoardService } from './board.service';
import {
  ALL,
  type BoardFilters,
  type BoardGroup,
  NO_FILTERS,
  fieldOptions,
  filtersActive,
  groupRows,
  prepareRows,
  repoOptions,
  statusCounts,
} from './board-view';

/**
 * The Project board page: what is being worked on, and what is done.
 *
 * WHERE THE DATA COMES FROM. `assets/board.json`, which nobody edits: the Pages
 * build writes it from the GitHub project board (scripts/fetch-board.mjs) on every
 * deploy and every hour. It holds a small, fixed copy of each item from a PUBLIC
 * repository and nothing else (src/app/board/board-data.ts). Not fetched live from
 * the browser: GitHub's API does not answer an anonymous visitor for a project.
 *
 * EVERYTHING FROM THE FILE IS RENDERED AS TEXT. A title is whatever somebody typed
 * into an issue; it is interpolated, never bound as HTML. An item's link is its own
 * address on github.com, which the validator has already checked character for
 * character, so no other address can reach an href here.
 *
 * WHEN THERE IS NO BOARD the page says so in one sentence and links to GitHub. That
 * is the normal state of a pull-request build and of a fork, and of this site until
 * the build is given a token.
 *
 * FOLDED GROUPS HAVE NO ROWS IN THE DOCUMENT. Finished work is most of the board;
 * its rows are created when the group is opened, so the first paint is the open
 * work only.
 */
@Component({
  selector: 'hug-board',
  templateUrl: './board.component.html',
  styleUrl: './board.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BoardComponent {
  private readonly board = inject(BoardService);

  readonly boardUrl = BOARD_URL;
  readonly all = ALL;

  private readonly loaded = this.board.loaded;
  readonly state = computed(() => this.loaded().state);
  readonly data = computed(() => {
    const l = this.loaded();
    return l.state === 'ready' ? l.data : null;
  });
  /** True when the build simply had no token: "not published here yet", not "failed". */
  readonly neverFetched = computed(() => {
    const l = this.loaded();
    return l.state === 'missing' || (l.state === 'unavailable' && l.reason === 'no-token');
  });

  private readonly rows = computed(() => {
    const d = this.data();
    return d ? prepareRows(d) : [];
  });

  readonly filters = signal<BoardFilters>(NO_FILTERS);
  readonly active = computed(() => filtersActive(this.filters()));

  /** What the reader opened or folded by hand. Forgotten when a filter changes. */
  private readonly toggled = signal<ReadonlyMap<string, boolean>>(new Map());

  readonly groups = computed<BoardGroup[]>(() => {
    const d = this.data();
    return d ? groupRows(d, this.rows(), this.filters()) : [];
  });
  readonly counts = computed(() => {
    const d = this.data();
    return d ? statusCounts(d) : [];
  });
  readonly total = computed(() => this.data()?.items.length ?? 0);
  readonly matching = computed(() => this.groups().reduce((n, g) => n + g.rows.length, 0));
  /** "508 items from 34 repositories." */
  readonly listed = computed(() => {
    const n = this.total();
    const r = new Set(this.data()?.items.map((i) => i.repo) ?? []).size;
    return `${n} ${n === 1 ? 'item' : 'items'} from ${r} ${r === 1 ? 'repository' : 'repositories'}.`;
  });

  readonly statusOptions = computed(() => {
    const d = this.data();
    return d ? fieldOptions(d.statuses, d.items.map((i) => i.status), 'All statuses', 'No status') : [];
  });
  readonly priorityOptions = computed(() => {
    const d = this.data();
    return d ? fieldOptions(d.priorities, d.items.map((i) => i.priority), 'All priorities', 'No priority') : [];
  });
  readonly waveOptions = computed(() => {
    const d = this.data();
    return d ? fieldOptions(d.waves, d.items.map((i) => i.wave), 'All waves', 'No wave') : [];
  });
  readonly repoOptions = computed(() => {
    const d = this.data();
    return d ? repoOptions(d) : [];
  });

  /** When the build read the board. */
  readonly updated = computed(() => {
    const g = this.data()?.generated;
    return g ? { iso: g, text: new Date(g).toUTCString().replace('GMT', 'UTC') } : null;
  });

  /** One sentence about what the board holds that this list leaves out, or null. */
  readonly leftOut = computed(() => {
    const w = this.data()?.withheld;
    if (!w) return null;
    const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
    const parts: string[] = [];
    if (w.notPublic > 0) parts.push(`${count(w.notPublic, 'item', 'items')} in a repository that is not public`);
    if (w.drafts > 0) parts.push(count(w.drafts, 'draft note', 'draft notes'));
    if (w.held > 0) parts.push(`${count(w.held, 'item', 'items')} held back by this site's check for private names`);
    if (parts.length === 0) return null;
    const list = parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
    return `Not listed here: ${list}.`;
  });

  /** For the screen-reader status line: said again whenever the filters change. */
  readonly summary = computed(() => {
    const total = this.total();
    if (!this.active()) return `${total} ${total === 1 ? 'item' : 'items'}.`;
    const n = this.matching();
    return n === 0 ? `Nothing matches. ${total} items in all.` : `${n} of ${total} items match.`;
  });

  /** A group's count: "30", or "12 of 30" while a filter hides some of its items. */
  countText(g: BoardGroup): string {
    return this.active() && g.rows.length !== g.total ? `${g.rows.length} of ${g.total}` : `${g.rows.length}`;
  }

  /**
   * A group is open when the reader opened it; otherwise finished work is folded
   * away, unless a filter is on, when every group with a match is shown: a search
   * whose results sit unseen in a folded group reads as "nothing found".
   */
  isOpen(g: BoardGroup): boolean {
    return this.toggled().get(g.id) ?? (this.active() || !g.finished);
  }

  toggle(g: BoardGroup): void {
    const next = new Map(this.toggled());
    next.set(g.id, !this.isOpen(g));
    this.toggled.set(next);
  }

  setFilter(key: keyof BoardFilters, value: string): void {
    this.filters.update((f) => ({ ...f, [key]: value }));
    this.toggled.set(new Map());
  }

  /** Back to the whole board, and back to the Find field: the button is gone once it has run. */
  clear(focus?: HTMLElement): void {
    this.filters.set(NO_FILTERS);
    this.toggled.set(new Map());
    focus?.focus();
  }
}
