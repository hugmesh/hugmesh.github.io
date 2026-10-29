import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { BehaviorSubject, of } from 'rxjs';
import { DocPageComponent } from './doc-page.component';
import { ContentService } from './content.service';
import { ContentIndex, DocPage } from './content.models';

const page = (over: Partial<DocPage> = {}): DocPage => ({
  section: 'tutorials',
  slug: 'two',
  route: '/tutorials/two',
  title: 'Step two',
  summary: 'The second step.',
  hasMermaid: false,
  readingMinutes: 4,
  toc: [
    { id: 'a', level: 2, text: 'First heading' },
    { id: 'b', level: 3, text: 'Nested heading' },
    { id: 'c', level: 2, text: 'Third heading' },
  ],
  source: { repo: 'hugmesh-generator', path: 'docs/TWO.md', ref: 'abc1234', url: null },
  html: '<p>Body text</p><h2 id="a">First heading</h2>',
  ...over,
});

const index: ContentIndex = {
  generatedFrom: 'test',
  sectionOrder: ['tutorials'],
  sections: [
    {
      id: 'tutorials',
      title: 'Tutorials',
      blurb: 'b',
      docs: [
        { slug: 'one', route: '/tutorials/one', title: 'Step one', summary: '', readingMinutes: 1 },
        { slug: 'two', route: '/tutorials/two', title: 'Step two', summary: '', readingMinutes: 4 },
        { slug: 'three', route: '/tutorials/three', title: 'Step three', summary: '', readingMinutes: 2 },
      ],
    },
  ],
  totals: { sections: 1, pages: 3 },
};

describe('DocPageComponent', () => {
  let fixture: ComponentFixture<DocPageComponent>;
  let params: BehaviorSubject<ReturnType<typeof convertToParamMap>>;
  let pageSubject: BehaviorSubject<DocPage | null>;

  function setup(initial: DocPage | null = page()): void {
    params = new BehaviorSubject(convertToParamMap({ section: 'tutorials', slug: 'two' }));
    pageSubject = new BehaviorSubject<DocPage | null>(initial);

    TestBed.configureTestingModule({
      imports: [DocPageComponent],
      providers: [
        provideRouter([]),
        { provide: ActivatedRoute, useValue: { paramMap: params.asObservable() } },
        {
          provide: ContentService,
          useValue: {
            index: () => of(index),
            section: (id: string) => of(index.sections.find((s) => s.id === id)),
            page: () => pageSubject.asObservable(),
            searchIndex: () => of([]),
            indexFailed: () => false,
          },
        },
      ],
    });
    fixture = TestBed.createComponent(DocPageComponent);
    fixture.detectChanges();
  }

  afterEach(() => TestBed.resetTestingModule());

  const text = () => (fixture.nativeElement as HTMLElement).textContent ?? '';

  it('renders the document body', () => {
    setup();
    expect(fixture.nativeElement.querySelector('.prose')!.innerHTML).toContain('Body text');
  });

  it('renders the page title as the h1', () => {
    setup();
    expect(fixture.nativeElement.querySelector('h1')!.textContent!.trim()).toBe('Step two');
  });

  it('names its upstream source', () => {
    setup();
    expect(text()).toContain('hugmesh-generator/docs/TWO.md');
  });

  it('does NOT link the source while the code repositories are private', () => {
    setup();
    const links = [...fixture.nativeElement.querySelectorAll('a')] as HTMLAnchorElement[];
    // A github.com link into a private repo is a 404 for every visitor; the
    // build sets source.url to null for exactly this reason.
    expect(links.some((a) => a.href.includes('github.com'))).toBeFalse();
  });

  it('links the source when the build says the repositories are public', () => {
    setup(page({ source: { repo: 'r', path: 'p.md', ref: null, url: 'https://github.com/hugmesh/r/blob/main/p.md' } }));
    const links = [...fixture.nativeElement.querySelectorAll('a')] as HTMLAnchorElement[];
    const gh = links.find((a) => a.href.includes('github.com'));
    expect(gh).toBeTruthy();
    // target=_blank without noopener hands the opened page a handle back into
    // this document.
    expect(gh!.rel).toContain('noopener');
  });

  it('offers previous and next within the section', () => {
    setup();
    const pager = fixture.nativeElement.querySelector('.pager') as HTMLElement;
    expect(pager.textContent).toContain('Step one');
    expect(pager.textContent).toContain('Step three');
  });

  it('shows a distinct state for a document that does not exist', () => {
    setup(null);
    expect(fixture.nativeElement.querySelector('.missing')).toBeTruthy();
    expect(text()).toContain('not here');
  });

  it('announces the loading state to assistive technology', () => {
    params = new BehaviorSubject(convertToParamMap({ section: 'tutorials', slug: 'two' }));
    TestBed.configureTestingModule({
      imports: [DocPageComponent],
      providers: [
        provideRouter([]),
        { provide: ActivatedRoute, useValue: { paramMap: params.asObservable() } },
        {
          provide: ContentService,
          useValue: {
            index: () => of(index),
            section: () => of(undefined),
            // Never emits: the component is stuck in its loading state.
            page: () => new BehaviorSubject<DocPage | null | undefined>(undefined).asObservable(),
            searchIndex: () => of([]),
            indexFailed: () => false,
          },
        },
      ],
    });
    const f = TestBed.createComponent(DocPageComponent);
    f.detectChanges();
    const status = f.nativeElement.querySelector('[role="status"]');
    expect(status).toBeTruthy();
    expect(status.getAttribute('aria-live')).toBe('polite');
  });

  it('exposes a #maincontent target for the skip link', () => {
    setup();
    expect(fixture.nativeElement.querySelector('#maincontent')).toBeTruthy();
  });

  it('renders a table of contents when the page has enough headings', () => {
    setup();
    expect(fixture.nativeElement.querySelectorAll('.toc li').length).toBe(3);
  });

  it('points every contents link at THIS page, not the site root', () => {
    // index.html sets <base href="/">, so an href of bare "#a" resolves to "/#a":
    // clicking it, or opening it in a new tab, went to the home page.
    setup();
    const hrefs = [...fixture.nativeElement.querySelectorAll('.toc a, .toc-inline a')].map((a) =>
      (a as HTMLAnchorElement).getAttribute('href'),
    );
    expect(hrefs.length).toBe(6);
    for (const h of hrefs) expect(h).toMatch(/^\/tutorials\/two#[abc]$/);
  });

  describe('clicks inside the rendered document', () => {
    const html =
      '<p><a id="same" href="/tutorials/two#c">same page</a> <a id="other" href="/tutorials/one#x">other</a> ' +
      '<a id="ext" href="https://example.org/" target="_blank" rel="noopener">ext</a> ' +
      '<a id="asset" href="/assets/content/index.json">raw</a></p>';
    let navigate: jasmine.Spy;

    beforeEach(() => {
      setup(page({ html }));
      navigate = spyOn(TestBed.inject(Router), 'navigateByUrl').and.resolveTo(true);
    });

    /** Click a link; true when the PAGE took the click over. A listener on the host
     *  (which the click reaches after the article's handler) then cancels it in
     *  every case, so the Karma frame itself never navigates away. */
    const click = (id: string, init: MouseEventInit = {}): boolean => {
      let takenOver = false;
      const host = fixture.nativeElement as HTMLElement;
      const guard = (e: Event) => {
        takenOver = e.defaultPrevented;
        e.preventDefault();
      };
      host.addEventListener('click', guard);
      const ev = new MouseEvent('click', { bubbles: true, cancelable: true, button: 0, ...init });
      (host.querySelector(`#${id}`) as HTMLElement).dispatchEvent(ev);
      host.removeEventListener('click', guard);
      return takenOver;
    };

    it('routes a link to another page of this site in-app instead of reloading', () => {
      expect(click('other')).toBeTrue();
      expect(navigate).toHaveBeenCalledWith('/tutorials/one#x');
    });

    it('keeps a same-page anchor on this page', () => {
      expect(click('same')).toBeTrue();
      expect(navigate).toHaveBeenCalledWith('/tutorials/two#c');
    });

    it('leaves external links, the raw payload and modified clicks to the browser', () => {
      expect(click('ext')).toBeFalse();
      expect(click('asset')).toBeFalse();
      expect(click('other', { ctrlKey: true })).toBeFalse();
      expect(navigate).not.toHaveBeenCalled();
    });
  });

  it('omits the contents rail for a short page', () => {
    setup(page({ toc: [{ id: 'a', level: 2, text: 'Only heading' }] }));
    expect(fixture.nativeElement.querySelector('.toc')).toBeNull();
  });
});
