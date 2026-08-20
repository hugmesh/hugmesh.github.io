import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { ContentService } from './content.service';
import { ContentIndex, DocPage } from './content.models';

const INDEX: ContentIndex = {
  generatedFrom: 'test',
  sectionOrder: ['tutorials'],
  sections: [
    {
      id: 'tutorials',
      title: 'Tutorials',
      blurb: 'b',
      docs: [{ slug: 'one', route: '/tutorials/one', title: 'One', summary: 's', readingMinutes: 2 }],
    },
  ],
  totals: { sections: 1, pages: 1 },
};

const PAGE = { section: 'tutorials', slug: 'one', title: 'One' } as unknown as DocPage;

describe('ContentService', () => {
  let service: ContentService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [ContentService, provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(ContentService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('fetches the index once however many subscribers ask for it', () => {
    service.index().subscribe();
    service.index().subscribe();
    service.section('tutorials').subscribe();
    // The nav, the home page and every routed view all read the index; one
    // request is the whole point of the replay cache.
    http.expectOne('assets/content/index.json').flush(INDEX);
  });

  it('resolves a section out of the index without a second request', (done) => {
    service.section('tutorials').subscribe((s) => {
      expect(s?.title).toBe('Tutorials');
      done();
    });
    http.expectOne('assets/content/index.json').flush(INDEX);
  });

  it('yields undefined for an unknown section rather than erroring', (done) => {
    service.section('nope').subscribe((s) => {
      expect(s).toBeUndefined();
      done();
    });
    http.expectOne('assets/content/index.json').flush(INDEX);
  });

  it('reports index failure through a signal instead of throwing', (done) => {
    service.index().subscribe((idx) => {
      expect(idx.sections).toEqual([]);
      expect(service.indexFailed()).toBeTrue();
      done();
    });
    http.expectOne('assets/content/index.json').error(new ProgressEvent('network'));
  });

  it('memoises a page so revisiting it costs no request', () => {
    service.page('tutorials', 'one').subscribe();
    http.expectOne('assets/content/tutorials/one.json').flush(PAGE);

    service.page('tutorials', 'one').subscribe((p) => expect(p?.title).toBe('One'));
    http.expectNone('assets/content/tutorials/one.json');
  });

  it('yields null for a missing page — a stale bookmark is not an error', (done) => {
    service.page('tutorials', 'gone').subscribe((p) => {
      expect(p).toBeNull();
      done();
    });
    http.expectOne('assets/content/tutorials/gone.json').flush('', { status: 404, statusText: 'Not Found' });
  });

  it('does not fetch the search index until something asks to search', () => {
    service.index().subscribe();
    http.expectOne('assets/content/index.json').flush(INDEX);
    // search.json is the largest asset on the site; a reader who never searches
    // must never pay for it.
    http.expectNone('assets/content/search.json');

    service.searchIndex().subscribe();
    http.expectOne('assets/content/search.json').flush([]);
  });

  it('degrades to an empty search index rather than breaking the page', (done) => {
    service.searchIndex().subscribe((docs) => {
      expect(docs).toEqual([]);
      done();
    });
    http.expectOne('assets/content/search.json').error(new ProgressEvent('network'));
  });
});
