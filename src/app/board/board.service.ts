import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { toSignal } from '@angular/core/rxjs-interop';
import { catchError, map, of } from 'rxjs';
import {
  BOARD_DATA_SCHEMA,
  type BoardAvailable,
  type BoardData,
  type BoardUnavailableReason,
  validateBoardData,
} from './board-data';

export type LoadedBoard =
  | { readonly state: 'loading' }
  /** No file at all: a local build, or a pull-request build, which fetches no board. */
  | { readonly state: 'missing' }
  /** A file written for another version of this page (see BOARD_DATA_SCHEMA). */
  | { readonly state: 'other-version' }
  | { readonly state: 'invalid'; readonly errors: readonly string[] }
  /** The build wrote "unavailable": it had no token, or could not read the board whole. */
  | { readonly state: 'unavailable'; readonly reason: BoardUnavailableReason }
  | { readonly state: 'ready'; readonly data: BoardAvailable };

/** What a fetched file is, decided before anything is rendered from it. */
export function classifyBoard(raw: unknown): LoadedBoard {
  // The version first, and on its own: a file in a newer shape would fail the
  // validator in ways that say nothing useful, when the honest message is "this
  // page and that file are from different builds of the site".
  if (typeof raw === 'object' && raw !== null && !Array.isArray(raw)) {
    const schema = (raw as Record<string, unknown>)['schema'];
    if (typeof schema === 'number' && schema !== BOARD_DATA_SCHEMA) return { state: 'other-version' };
  }
  const errors = validateBoardData(raw);
  if (errors.length > 0) return { state: 'invalid', errors };
  const data = raw as BoardData;
  return data.state === 'ok' ? { state: 'ready', data } : { state: 'unavailable', reason: data.reason };
}

/**
 * assets/board.json, fetched when the Project board page is first opened.
 *
 * `cache: 'no-cache'` ASKS THE SERVER EVERY TIME. The file has the same address in
 * every build, and GitHub Pages lets a browser keep it for ten minutes without
 * asking. A reader who had the site open across a deploy would then get the new
 * page with the old file, or the old page with the new file. With `no-cache` the
 * browser still keeps its copy but checks it first (a conditional request, usually
 * answered "not modified" with no body), so the file is always the one the site
 * serves now. The version inside the file covers the other half: a page that is
 * older than the file says so instead of rendering a shape it does not know.
 */
@Injectable({ providedIn: 'root' })
export class BoardService {
  private readonly http = inject(HttpClient);

  readonly loaded = toSignal(
    this.http.get<unknown>('assets/board.json', { cache: 'no-cache' }).pipe(
      map(classifyBoard),
      catchError(() => of<LoadedBoard>({ state: 'missing' })),
    ),
    { initialValue: { state: 'loading' } as LoadedBoard },
  );
}
