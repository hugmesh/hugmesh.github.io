import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { ContentService, RELOAD_GUARD_KEY, RELOAD_PAGE } from './content.service';
import { ContentIndex, DocPage } from './content.models';
import { CONTENT_BUILD_ID } from './content-build';

// Every payload file is asked for at its build-stamped address (hugmesh.github.io#42).
const V = `?v=${CONTENT_BUILD_ID}`;
const INDEX_URL = `assets/content/index.json${V}`;
const isFreshIndex = (url: string) => url.startsWith(`${INDEX_URL}&fresh=`);

const INDEX: ContentIndex = {
  buildId: CONTENT_BUILD_ID,
  generatedFrom: 'test',
  sectionOrder: ['tutorials'],
  sections: [
    {
      id: 'tutorials',
      title: 'Tutorials',
      blurb: 'b',
      groups: [{ id: 'g', title: 'G', blurb: null, routes: ['/tutorials/one'] }],
      docs: [{ slug: 'one', route: '/tutorials/one', title: 'One', summary: 's', readingMinutes: 2 }],
    },
  ],
  totals: { sections: 1, pages: 1 },
};

const PAGE = { section: 'tutorials', slug: 'one', title: 'One' } as unknown as DocPage;

describe('ContentService', () => {
  let service: ContentService;
  let http: HttpTestingController;
  let reload: jasmine.Spy;

  beforeEach(() => {
    sessionStorage.removeItem(RELOAD_GUARD_KEY);
    reload = jasmine.createSpy('reload');
    TestBed.configureTestingModule({
      providers: [
        ContentService,
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: RELOAD_PAGE, useValue: reload },
      ],
    });
    service = TestBed.inject(ContentService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
    sessionStorage.removeItem(RELOAD_GUARD_KEY);
  });

  it('fetches the index once however many subscribers ask for it', () => {
    service.index().subscribe();
    service.index().subscribe();
    service.section('tutorials').subscribe();
    // The nav, the home page and every routed view all read the index; one
    // request is the whole point of the replay cache. expectOne() already fails
    // on a second request, but assert it explicitly so jasmine can see the
    // expectation -- a spec it counts as having none is one nobody notices
    // going vacuous.
    const requests = http.match(INDEX_URL);
    expect(requests.length).toBe(1);
    requests[0].flush(INDEX);
  });

  it('resolves a section out of the index without a second request', (done) => {
    service.section('tutorials').subscribe((s) => {
      expect(s?.title).toBe('Tutorials');
      done();
    });
    http.expectOne(INDEX_URL).flush(INDEX);
  });

  it('yields undefined for an unknown section rather than erroring', (done) => {
    service.section('nope').subscribe((s) => {
      expect(s).toBeUndefined();
      done();
    });
    http.expectOne(INDEX_URL).flush(INDEX);
  });

  it('reports index failure through a signal instead of throwing', (done) => {
    service.index().subscribe((idx) => {
      expect(idx.sections).toEqual([]);
      expect(service.indexFailed()).toBeTrue();
      done();
    });
    http.expectOne(INDEX_URL).error(new ProgressEvent('network'));
  });

  it('memoises a page so revisiting it costs no request', () => {
    service.page('tutorials', 'one').subscribe();
    http.expectOne(`assets/content/tutorials/one.json${V}`).flush(PAGE);

    service.page('tutorials', 'one').subscribe((p) => expect(p?.title).toBe('One'));
    http.expectNone(`assets/content/tutorials/one.json${V}`);
  });

  it('yields null for a missing page — a stale bookmark is not an error', (done) => {
    service.page('tutorials', 'gone').subscribe((p) => {
      expect(p).toBeNull();
      done();
    });
    http.expectOne(`assets/content/tutorials/gone.json${V}`).flush('', { status: 404, statusText: 'Not Found' });
  });

  it('does not fetch the search index until something asks to search', () => {
    service.index().subscribe();
    http.expectOne(INDEX_URL).flush(INDEX);
    // search.json is the largest asset on the site; a reader who never searches
    // must never pay for it. Asserted explicitly rather than leaning on
    // expectNone/expectOne alone, so jasmine counts the expectation and the
    // spec cannot quietly become one that checks nothing.
    expect(http.match(`assets/content/search.json${V}`).length).toBe(0);

    service.searchIndex().subscribe();
    const search = http.match(`assets/content/search.json${V}`);
    expect(search.length).toBe(1);
    search[0].flush([]);
  });

  it('degrades to an empty search index rather than breaking the page', (done) => {
    service.searchIndex().subscribe((docs) => {
      expect(docs).toEqual([]);
      done();
    });
    http.expectOne(`assets/content/search.json${V}`).error(new ProgressEvent('network'));
  });

  it('stamps every payload request with the build the app was compiled with', () => {
    expect(CONTENT_BUILD_ID).toMatch(/^[0-9a-f]{16}$/);
    service.index().subscribe();
    service.page('tutorials', 'one').subscribe();
    service.searchIndex().subscribe();
    const urls = http.match(() => true).map((r) => {
      r.flush(r.request.url.includes('index.json') ? INDEX : {});
      return r.request.url;
    });
    expect(urls.sort()).toEqual(
      [INDEX_URL, `assets/content/tutorials/one.json${V}`, `assets/content/search.json${V}`].sort(),
    );
    expect(service.payload()).toBe('current');
  });

  it('re-reads another build\'s index once past the caches, and uses the current one', () => {
    let got: ContentIndex | undefined;
    service.index().subscribe((i) => (got = i));
    // The incident: a cached index from before #39, without buildId or groups.
    http.expectOne(INDEX_URL).flush(OLD_INDEX);
    expect(got).toBeUndefined();
    expect(service.payload()).toBe('loading');

    const again = http.match((r) => isFreshIndex(r.url));
    expect(again.length).toBe(1);
    expect(again[0].request.cache).toBe('reload');
    again[0].flush(INDEX);

    expect(got?.buildId).toBe(CONTENT_BUILD_ID);
    expect(service.payload()).toBe('current');
    expect(reload).not.toHaveBeenCalled();
  });

  it('reloads the page once when the server\'s payload is from another build', () => {
    let emitted = false;
    service.index().subscribe(() => (emitted = true));
    http.expectOne(INDEX_URL).flush(NEWER_INDEX);
    http.expectOne((r) => isFreshIndex(r.url)).flush(NEWER_INDEX);

    expect(reload).toHaveBeenCalledTimes(1);
    expect(service.payload()).toBe('reloading');
    expect(emitted).toBeFalse();
    expect(sessionStorage.getItem(RELOAD_GUARD_KEY)).toBe(`${CONTENT_BUILD_ID}>newer-build`);
  });

  it('does not reload a second time for the same payload: no loop', () => {
    sessionStorage.setItem(RELOAD_GUARD_KEY, `${CONTENT_BUILD_ID}>newer-build`);
    let got: ContentIndex | undefined;
    service.index().subscribe((i) => (got = i));
    http.expectOne(INDEX_URL).flush(NEWER_INDEX);
    http.expectOne((r) => isFreshIndex(r.url)).flush(NEWER_INDEX);

    expect(reload).not.toHaveBeenCalled();
    expect(service.payload()).toBe('other-build');
    expect(got?.buildId).toBe('newer-build');
  });

  it('does not reload when sessionStorage cannot hold the guard', () => {
    spyOn(Storage.prototype, 'getItem').and.throwError('blocked');
    service.index().subscribe();
    http.expectOne(INDEX_URL).flush(NEWER_INDEX);
    http.expectOne((r) => isFreshIndex(r.url)).flush(NEWER_INDEX);

    expect(reload).not.toHaveBeenCalled();
    expect(service.payload()).toBe('other-build');
  });

  it('re-reads an index that has this build id but not the shape the tabs read', () => {
    service.index().subscribe();
    const noGroups = { ...INDEX, sections: [{ ...INDEX.sections[0], groups: undefined }] } as unknown as ContentIndex;
    http.expectOne(INDEX_URL).flush(noGroups);
    expect(service.payload()).toBe('loading');
    http.expectOne((r) => isFreshIndex(r.url)).flush(INDEX);
    expect(service.payload()).toBe('current');
  });

  it('does not reload when the re-read itself fails: nothing confirmed another build', () => {
    let got: ContentIndex | undefined;
    service.index().subscribe((i) => (got = i));
    http.expectOne(INDEX_URL).flush(NEWER_INDEX);
    http.expectOne((r) => isFreshIndex(r.url)).error(new ProgressEvent('network'));
    expect(reload).not.toHaveBeenCalled();
    expect(service.payload()).toBe('other-build');
    expect(got?.buildId).toBe('newer-build');
  });

  it('treats a network failure as a failure, not as another build', () => {
    service.index().subscribe();
    http.expectOne(INDEX_URL).error(new ProgressEvent('network'));
    expect(http.match((r) => isFreshIndex(r.url)).length).toBe(0);
    expect(reload).not.toHaveBeenCalled();
    expect(service.payload()).toBe('failed');
    expect(service.indexFailed()).toBeTrue();
  });
});

/** index.json as the site served it before #39: no buildId, no groups. */
const OLD_INDEX = {
  generatedFrom: 'old',
  sectionOrder: ['tutorials'],
  sections: [{ id: 'tutorials', title: 'Tutorials', blurb: 'b', docs: [] }],
  totals: { sections: 1, pages: 0 },
} as unknown as ContentIndex;

const NEWER_INDEX: ContentIndex = { ...INDEX, buildId: 'newer-build' };
