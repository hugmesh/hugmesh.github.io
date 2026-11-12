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
  sectionOrder: ['tutorials', 'studio', 'operations'],
  sections: [
    {
      id: 'tutorials',
      title: 'Get started',
      blurb: 'b',
      groups: [{ id: 'main', title: 'Main', blurb: null, routes: ['/downloads', '/tutorials/one', '/tutorials/two', '/tutorials/three'] }],
      docs: [
        { slug: 'one', route: '/tutorials/one', title: 'Step one', summary: '', readingMinutes: 1, navSection: 'tutorials', navGroup: 'main' },
        { slug: 'two', route: '/tutorials/two', title: 'Step two', summary: '', readingMinutes: 4, navSection: 'tutorials', navGroup: 'main' },
        { slug: 'three', route: '/tutorials/three', title: 'Step three', summary: '', readingMinutes: 2, navSection: 'tutorials', navGroup: 'main' },
      ],
    },
    {
      // Studio LISTS a page whose URL is under /operations/: its nav home.
      id: 'studio',
      title: 'Studio',
      blurb: 'b',
      groups: [{ id: 'use', title: 'Use the Studio', blurb: null, routes: ['/studio/install', '/operations/limits', '/studio/guide'] }],
      docs: [
        { slug: 'install', route: '/studio/install', title: 'Install the Studio', summary: '', readingMinutes: 1, navSection: 'studio', navGroup: 'use' },
        { slug: 'guide', route: '/studio/guide', title: 'Studio user guide', summary: '', readingMinutes: 1, navSection: 'studio', navGroup: 'use' },
      ],
    },
    {
      id: 'operations',
      title: 'Run a mesh',
      blurb: 'b',
      groups: [{ id: 'manage', title: 'Manage', blurb: null, routes: ['/operations/consoles'] }],
      docs: [
        { slug: 'consoles', route: '/operations/consoles', title: 'Admin consoles', summary: '', readingMinutes: 1, navSection: 'operations', navGroup: 'manage' },
        { slug: 'limits', route: '/operations/limits', title: 'Limit builds', summary: '', readingMinutes: 1, navSection: 'studio', navGroup: 'use' },
      ],
    },
  ],
  redirects: { '/tutorials/old-step': '/tutorials/three', '/operations/old-tuning': '/operations/limits#caps' },
  totals: { sections: 3, pages: 6 },
};

describe('DocPageComponent', () => {
  let fixture: ComponentFixture<DocPageComponent>;
  let params: BehaviorSubject<ReturnType<typeof convertToParamMap>>;
  let pageSubject: BehaviorSubject<DocPage | null>;

  function setup(
    initial: DocPage | null = page(),
    at: { section: string; slug: string } = { section: 'tutorials', slug: 'two' },
    fragment: string | null = null,
  ): void {
    params = new BehaviorSubject(convertToParamMap(at));
    pageSubject = new BehaviorSubject<DocPage | null>(initial);

    TestBed.configureTestingModule({
      imports: [DocPageComponent],
      providers: [
        provideRouter([]),
        { provide: ActivatedRoute, useValue: { paramMap: params.asObservable(), fragment: of(fragment) } },
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

  it('a page written for the site links the files it was checked against, at the recorded commit', () => {
    const ref = 'f'.repeat(40);
    setup(
      page({
        source: null,
        basis: [
          { repo: 'hugmesh-actions', path: 'README.md', ref, url: `https://github.com/hugmesh/hugmesh-actions/blob/${ref}/README.md` },
          { repo: 'hugmesh-actions', path: 'src/main/resources/application.yml', ref, url: null },
        ],
      }),
    );
    const note = fixture.nativeElement.querySelector('[data-testid="basis-note"]') as HTMLElement;
    expect(note).toBeTruthy();
    expect(note.textContent).toContain('hugmesh-actions/README.md');
    expect(note.textContent).toContain('hugmesh-actions/src/main/resources/application.yml');
    // One sentence, with no space before the comma or the full stop.
    expect(note.textContent!.replace(/\s+/g, ' ')).toContain(
      'checked against hugmesh-actions/README.md, hugmesh-actions/src/main/resources/application.yml. Where the page and those files disagree',
    );
    const links = [...note.querySelectorAll('a')] as HTMLAnchorElement[];
    expect(links.map((a) => a.getAttribute('href'))).toEqual([`https://github.com/hugmesh/hugmesh-actions/blob/${ref}/README.md`]);
    expect(links[0].rel).toContain('noopener');
  });

  it('a page with neither a source nor a basis shows no provenance note', () => {
    setup(page({ source: null, basis: [] }));
    expect(fixture.nativeElement.querySelector('.source-note')).toBeNull();
  });

  it('offers previous and next in the reading order of the tab', () => {
    setup();
    const pager = fixture.nativeElement.querySelector('.pager') as HTMLElement;
    expect(pager.textContent).toContain('Step one');
    expect(pager.textContent).toContain('Step three');
  });

  it('never offers the Downloads page as "previous", although the tab lists it first', () => {
    setup(page({ section: 'tutorials', slug: 'one', route: '/tutorials/one', title: 'Step one' }), { section: 'tutorials', slug: 'one' });
    expect(fixture.nativeElement.querySelector('[data-testid="pager-prev"]')).toBeNull();
    expect((fixture.nativeElement.querySelector('[data-testid="pager-next"]') as HTMLElement).textContent).toContain('Step two');
  });

  describe('a page listed under another tab than its URL prefix', () => {
    const limits = () =>
      setup(
        page({ section: 'operations', slug: 'limits', route: '/operations/limits', title: 'Limit builds' }),
        { section: 'operations', slug: 'limits' },
      );

    it('takes its breadcrumb from the tab that lists it', () => {
      limits();
      const crumb = fixture.nativeElement.querySelector('[data-testid="crumb-section"]') as HTMLAnchorElement;
      expect(crumb.textContent!.trim()).toBe('Studio');
      expect(crumb.getAttribute('href')).toBe('/studio');
    });

    it('walks prev and next through that tab, not through its URL section', () => {
      limits();
      expect((fixture.nativeElement.querySelector('[data-testid="pager-prev"]') as HTMLElement).textContent).toContain('Install the Studio');
      expect((fixture.nativeElement.querySelector('[data-testid="pager-next"]') as HTMLElement).textContent).toContain('Studio user guide');
    });

    it('shows that tab\'s pages in the rail, with this page marked current', () => {
      limits();
      const rail = fixture.nativeElement.querySelector('hug-sidebar') as HTMLElement;
      expect(rail.textContent).toContain('Install the Studio');
      expect(rail.textContent).not.toContain('Admin consoles');
      expect(rail.querySelector('[aria-current="page"]')!.textContent!.trim()).toBe('Limit builds');
    });
  });

  it('shows reading time only for a page of five minutes or more', () => {
    setup();
    expect(fixture.nativeElement.querySelector('[data-testid="reading-time"]')).toBeNull();
    TestBed.resetTestingModule();
    setup(page({ readingMinutes: 7 }));
    expect((fixture.nativeElement.querySelector('[data-testid="reading-time"]') as HTMLElement).textContent).toContain('7 min read');
  });

  describe('a retired URL', () => {
    it('is replaced by the page its content moved to', () => {
      const navigate = spyOn(Router.prototype, 'navigateByUrl').and.resolveTo(true);
      setup(null, { section: 'tutorials', slug: 'old-step' });
      expect(navigate).toHaveBeenCalledWith('/tutorials/three', { replaceUrl: true });
      // While it is sent on, it does not first claim the page is missing.
      expect(fixture.nativeElement.querySelector('.missing')).toBeNull();
    });

    it('keeps the #fragment the old link carried, unless the redirect names its own', () => {
      const navigate = spyOn(Router.prototype, 'navigateByUrl').and.resolveTo(true);
      setup(null, { section: 'tutorials', slug: 'old-step' }, 'step-3');
      expect(navigate).toHaveBeenCalledWith('/tutorials/three#step-3', { replaceUrl: true });
      navigate.calls.reset();
      TestBed.resetTestingModule();
      setup(null, { section: 'operations', slug: 'old-tuning' }, 'ignored');
      expect(navigate).toHaveBeenCalledWith('/operations/limits#caps', { replaceUrl: true });
    });

    it('a URL that never existed still says the page is not here', () => {
      const navigate = spyOn(Router.prototype, 'navigateByUrl').and.resolveTo(true);
      setup(null, { section: 'tutorials', slug: 'never' });
      expect(navigate).not.toHaveBeenCalled();
      expect(fixture.nativeElement.querySelector('.missing')).toBeTruthy();
    });
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

  describe('opened at a #fragment (cold load, or a link from another page)', () => {
    // No <hug-header> in this fixture, so "just below the header" is the 16px gap.
    const GAP = 16;
    const html =
      '<div id="pad" style="height:3000px"></div><h2 id="c">Third heading</h2><div style="height:3000px"></div>';
    const frames = (n = 3) =>
      new Promise<void>((done) => {
        const step = (k: number) => (k ? requestAnimationFrame(() => step(k - 1)) : setTimeout(done, 30));
        step(n);
      });
    const headingTop = () =>
      (fixture.nativeElement.querySelector('#c') as HTMLElement).getBoundingClientRect().top;

    beforeEach(async () => {
      params = new BehaviorSubject(convertToParamMap({ section: 'tutorials', slug: 'two' }));
      pageSubject = new BehaviorSubject<DocPage | null>(null);
      TestBed.configureTestingModule({
        imports: [DocPageComponent],
        providers: [
          provideRouter([]),
          { provide: ActivatedRoute, useValue: { paramMap: params.asObservable(), fragment: of('c') } },
          {
            provide: ContentService,
            useValue: {
              index: () => of(index),
              section: () => of(undefined),
              page: () => pageSubject.asObservable(),
              searchIndex: () => of([]),
              indexFailed: () => false,
            },
          },
        ],
      });
      window.scrollTo({ top: 0, behavior: 'instant' });
      fixture = TestBed.createComponent(DocPageComponent);
      fixture.detectChanges();
      await fixture.whenStable();
      // The body arrives after navigation, as it does on a real cold load.
      pageSubject.next(page({ html }));
      fixture.detectChanges();
      await fixture.whenStable();
      await frames();
    });

    afterEach(() => window.scrollTo({ top: 0, behavior: 'instant' }));

    it('lands the heading just below the header once the body has rendered', () => {
      expect(Math.abs(headingTop() - GAP)).withContext(`heading top ${headingTop()}`).toBeLessThanOrEqual(2);
      expect(window.scrollX).toBe(0);
    });

    it('stays on the heading when the layout above it shifts afterwards (a font swap, a drawn diagram)', async () => {
      (fixture.nativeElement.querySelector('#pad') as HTMLElement).style.height = '3700px';
      await frames();
      expect(Math.abs(headingTop() - GAP)).withContext(`heading top ${headingTop()} after a 700px shift`).toBeLessThanOrEqual(2);
      (fixture.nativeElement.querySelector('#pad') as HTMLElement).style.height = '2500px';
      await frames();
      expect(Math.abs(headingTop() - GAP)).withContext(`heading top ${headingTop()} after a 1200px shrink`).toBeLessThanOrEqual(2);
    });

    it('leaves the page alone once the reader scrolls, even if the layout shifts later', async () => {
      window.dispatchEvent(new WheelEvent('wheel', { deltaY: 100 }));
      (fixture.nativeElement.querySelector('#pad') as HTMLElement).style.height = '3700px';
      await frames();
      expect(Math.round(headingTop() - GAP)).toBe(700);
    });
  });

  it('omits the contents rail for a short page', () => {
    setup(page({ toc: [{ id: 'a', level: 2, text: 'Only heading' }] }));
    expect(fixture.nativeElement.querySelector('.toc')).toBeNull();
  });
});
