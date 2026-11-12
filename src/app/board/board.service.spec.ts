import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { BOARD_DATA_SCHEMA } from './board-data';
import { BoardService, classifyBoard } from './board.service';
import fixture from './testing/board.fixture.json';

describe('classifyBoard', () => {
  it('accepts the board the build writes', () => {
    expect(classifyBoard(fixture).state).toBe('ready');
  });

  it('reads a file with another schema number as "another version", before validating anything else', () => {
    expect(classifyBoard({ ...fixture, schema: BOARD_DATA_SCHEMA + 1 })).toEqual({ state: 'other-version' });
    // A newer shape that the validator would also refuse is still "another version".
    expect(classifyBoard({ schema: BOARD_DATA_SCHEMA + 1, rows: [] })).toEqual({ state: 'other-version' });
  });

  it('passes on why the build had no board', () => {
    const at = '2026-11-01T08:00:00.000Z';
    expect(classifyBoard({ schema: BOARD_DATA_SCHEMA, generated: at, state: 'unavailable', reason: 'no-token' })).toEqual({
      state: 'unavailable',
      reason: 'no-token',
    });
    expect(classifyBoard({ schema: BOARD_DATA_SCHEMA, generated: at, state: 'unavailable', reason: 'incomplete' })).toEqual({
      state: 'unavailable',
      reason: 'incomplete',
    });
  });

  it('refuses a file that is damaged or carries more than the safe subset', () => {
    expect(classifyBoard(null).state).toBe('invalid');
    expect(classifyBoard('[]').state).toBe('invalid');
    const extra = { ...fixture, items: [{ ...fixture.items[0], assignees: ['someone'] }] };
    expect(classifyBoard(extra).state).toBe('invalid');
    const elsewhere = { ...fixture, items: [{ ...fixture.items[0], url: 'https://example.com/x' }] };
    expect(classifyBoard(elsewhere).state).toBe('invalid');
    // An "unavailable" file cannot smuggle items in.
    const smuggled = { schema: BOARD_DATA_SCHEMA, generated: fixture.generated, state: 'unavailable', reason: 'no-token', items: [] };
    expect(classifyBoard(smuggled).state).toBe('invalid');
  });
});

describe('BoardService', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('asks the server every time (no-cache), so a new deploy never shows an old file', () => {
    const service = TestBed.inject(BoardService);
    expect(service.loaded().state).toBe('loading');
    const req = http.expectOne('assets/board.json');
    expect(req.request.method).toBe('GET');
    expect(req.request.cache).toBe('no-cache');
    req.flush(fixture);
    expect(service.loaded().state).toBe('ready');
  });

  it('treats a missing file as "no board in this build", not as an error page', () => {
    const service = TestBed.inject(BoardService);
    http.expectOne('assets/board.json').flush('not found', { status: 404, statusText: 'Not Found' });
    expect(service.loaded()).toEqual({ state: 'missing' });
  });
});
