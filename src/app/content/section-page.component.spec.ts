import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { SectionPageComponent } from './section-page.component';
import { RELOAD_GUARD_KEY, RELOAD_PAGE } from './content.service';
import { ContentIndex } from './content.models';
import { CONTENT_BUILD_ID } from './content-build';

/**
 * hugmesh.github.io#42: after the #39 deploy a returning browser fed its cached,
 * old-shape index.json to the new app, and every tab said "Nothing is published in
 * this section yet" for ten minutes. These specs drive the REAL ContentService
 * through HttpTestingController, so the request addresses are part of what is tested.
 */
const INDEX_URL = `assets/content/index.json?v=${CONTENT_BUILD_ID}`;
const isFreshIndex = (url: string) => url.startsWith(`${INDEX_URL}&fresh=`);
const EMPTY_TEXT = 'Nothing is published in this section yet';

const doc = { slug: 'one', route: '/tutorials/one', title: 'First steps', summary: 's', readingMinutes: 2 };

/** This app's build, with one group on the Tutorials tab. */
const CURRENT: ContentIndex = {
  buildId: CONTENT_BUILD_ID,
  generatedFrom: 'test',
  sectionOrder: ['tutorials'],
  sections: [
    {
      id: 'tutorials',
      title: 'Tutorials',
      blurb: 'b',
      groups: [{ id: 'start', title: 'Getting started', blurb: null, routes: ['/tutorials/one'] }],
      docs: [{ ...doc, navSection: 'tutorials', navGroup: 'start' }],
    },
  ],
  totals: { sections: 1, pages: 1 },
};

/** The incident: index.json as the site served it before #39, no buildId, no groups. */
const OLD_SHAPE = {
  generatedFrom: 'old',
  sectionOrder: ['tutorials'],
  sections: [{ id: 'tutorials', title: 'Tutorials', blurb: 'b', docs: [doc] }],
  totals: { sections: 1, pages: 1 },
} as unknown as ContentIndex;

describe('SectionPageComponent', () => {
  let fixture: ComponentFixture<SectionPageComponent>;
  let http: HttpTestingController;
  let reload: jasmine.Spy;

  beforeEach(() => {
    sessionStorage.removeItem(RELOAD_GUARD_KEY);
    reload = jasmine.createSpy('reload');
    TestBed.configureTestingModule({
      imports: [SectionPageComponent],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: ActivatedRoute, useValue: { paramMap: of(convertToParamMap({ section: 'tutorials' })) } },
        { provide: RELOAD_PAGE, useValue: reload },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(SectionPageComponent);
    fixture.detectChanges();
  });

  afterEach(() => {
    http.verify();
    sessionStorage.removeItem(RELOAD_GUARD_KEY);
    TestBed.resetTestingModule();
  });

  const text = () => (fixture.nativeElement as HTMLElement).textContent ?? '';
  const settle = async () => {
    await fixture.whenStable();
    fixture.detectChanges();
  };

  /** The first index request, which must carry this app's build stamp. */
  const firstIndex = () => {
    const reqs = http.match((r) => r.url.startsWith('assets/content/index.json'));
    expect(reqs.map((r) => r.request.url)).toEqual([INDEX_URL]);
    return reqs[0];
  };

  it('re-reads a stale old-shape index past the cache and renders the tab, never the empty text', async () => {
    firstIndex().flush(OLD_SHAPE);
    await settle();
    expect(text()).not.toContain(EMPTY_TEXT);

    const again = http.match((r) => isFreshIndex(r.url));
    expect(again.length).toBe(1);
    expect(again[0].request.cache).toBe('reload');
    again[0].flush(CURRENT);
    await settle();

    expect(text()).not.toContain(EMPTY_TEXT);
    expect(fixture.nativeElement.querySelector('[data-testid="group-start"]')).not.toBeNull();
    expect(text()).toContain('First steps');
    expect(reload).not.toHaveBeenCalled();
  });

  it('an old-shape index with a DIFFERENT buildId is re-read too, and never shown as empty', async () => {
    firstIndex().flush({ ...OLD_SHAPE, buildId: 'another-build' });
    await settle();
    expect(text()).not.toContain(EMPTY_TEXT);
    const again = http.match((r) => isFreshIndex(r.url));
    expect(again.length).toBe(1);
    again[0].flush(CURRENT);
    await settle();
    expect(text()).not.toContain(EMPTY_TEXT);
    expect(fixture.nativeElement.querySelector('[data-testid="group-start"]')).not.toBeNull();
  });

  it('an index that could not be loaded is reported as such, not as an empty tab', async () => {
    firstIndex().error(new ProgressEvent('network'));
    await settle();
    expect(text()).not.toContain(EMPTY_TEXT);
    expect(fixture.nativeElement.querySelector('[data-testid="section-failed"]')).not.toBeNull();
    expect(reload).not.toHaveBeenCalled();
  });

  it('when the server is still on another build, says it is reloading and reloads once', async () => {
    firstIndex().flush(OLD_SHAPE);
    await settle();
    http.expectOne((r) => isFreshIndex(r.url)).flush(OLD_SHAPE);
    await settle();

    expect(reload).toHaveBeenCalledTimes(1);
    expect(text()).not.toContain(EMPTY_TEXT);
    expect(fixture.nativeElement.querySelector('[data-testid="section-updating"]')).not.toBeNull();
  });

  it('after its one reload, still never claims the tab is empty', async () => {
    sessionStorage.setItem(RELOAD_GUARD_KEY, `${CONTENT_BUILD_ID}>none`);
    firstIndex().flush(OLD_SHAPE);
    await settle();
    http.expectOne((r) => isFreshIndex(r.url)).flush(OLD_SHAPE);
    await settle();

    expect(reload).not.toHaveBeenCalled();
    expect(text()).not.toContain(EMPTY_TEXT);
    expect(fixture.nativeElement.querySelector('[data-testid="section-other-build"]')).not.toBeNull();
  });

  it('shows the empty text when a current-build index really has no groups for the tab', async () => {
    const empty: ContentIndex = {
      ...CURRENT,
      sections: [{ ...CURRENT.sections[0], groups: [], docs: [] }],
    };
    firstIndex().flush(empty);
    await settle();

    expect(http.match((r) => isFreshIndex(r.url)).length).toBe(0);
    expect(text()).toContain(EMPTY_TEXT);
    expect(fixture.nativeElement.querySelector('[data-testid="section-empty"]')).not.toBeNull();
    expect(reload).not.toHaveBeenCalled();
  });
});
