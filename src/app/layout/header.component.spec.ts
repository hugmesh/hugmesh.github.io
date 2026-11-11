import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { of } from 'rxjs';
import { HeaderComponent } from './header.component';
import { SECTIONS } from '../content/sections';
import { ContentService } from '../content/content.service';
import { ContentIndex } from '../content/content.models';

const index: ContentIndex = {
  generatedFrom: 'test',
  sectionOrder: SECTIONS.map((s) => s.id),
  sections: [
    {
      id: 'operations',
      title: 'Run a mesh',
      blurb: 'b',
      docs: [
        { slug: 'resource-limits', route: '/operations/resource-limits', title: 'Limit builds', summary: '', readingMinutes: 1, navSection: 'studio', navGroup: 'use' },
        { slug: 'keys-usb', route: '/operations/keys-usb', title: 'The KEYS stick', summary: '', readingMinutes: 1, navSection: 'operations', navGroup: 'keys' },
      ],
    },
  ],
  totals: { sections: 1, pages: 2 },
};

describe('HeaderComponent', () => {
  let fixture: ComponentFixture<HeaderComponent>;
  let router: Router;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [HeaderComponent],
      providers: [
        provideRouter([{ path: '**', children: [] }]),
        { provide: ContentService, useValue: { index: () => of(index) } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(HeaderComponent);
    router = TestBed.inject(Router);
    fixture.detectChanges();
  });

  const el = (sel: string) => fixture.nativeElement.querySelector(sel) as HTMLElement;

  it('links to every section, so nothing published is unreachable', () => {
    const links = fixture.nativeElement.querySelectorAll('#primary-nav a');
    expect(links.length).toBe(SECTIONS.length);
    for (const section of SECTIONS) {
      expect(el(`[data-testid="nav-${section.id}"]`))
        .withContext(`nav entry for ${section.id}`)
        .toBeTruthy();
    }
  });

  it('lists the tabs in newcomer order, in four clusters', () => {
    const labels = (Array.from(fixture.nativeElement.querySelectorAll('#primary-nav a')) as HTMLElement[]).map((a) =>
      a.textContent!.trim(),
    );
    expect(labels).toEqual([
      'Overview', 'Get started', 'Studio', 'Run a mesh', 'Troubleshooting',
      'Devices', 'Security', 'Architecture', 'Reference', 'Games', 'Developers',
    ]);
    const clusters = Array.from(fixture.nativeElement.querySelectorAll('#primary-nav .cluster-name')) as HTMLElement[];
    expect(clusters.map((c) => c.textContent!.trim())).toEqual(['Learn', 'Use', 'Reference', 'Build on it']);
  });

  it('marks the tab that lists the current page, not the URL prefix', async () => {
    await router.navigateByUrl('/operations/resource-limits');
    fixture.detectChanges();
    expect(el('[data-testid="nav-studio"]').classList).toContain('active');
    expect(el('[data-testid="nav-studio"]').getAttribute('aria-current')).toBe('page');
    expect(el('[data-testid="nav-operations"]').classList).not.toContain('active');

    await router.navigateByUrl('/operations/keys-usb');
    fixture.detectChanges();
    expect(el('[data-testid="nav-operations"]').classList).toContain('active');

    await router.navigateByUrl('/games');
    fixture.detectChanges();
    expect(el('[data-testid="nav-games"]').classList).toContain('active');
    expect(fixture.nativeElement.querySelectorAll('#primary-nav a.active').length).toBe(1);
  });

  it('offers a Download button that goes to /downloads and is not inside the collapsible menu', () => {
    const dl = el('[data-testid="header-download"]');
    expect(dl).toBeTruthy();
    expect(dl.getAttribute('href')).toBe('/downloads');
    expect(dl.textContent!.trim()).toBe('Download');
    expect(dl.closest('#primary-nav')).withContext('must stay visible when the menu is closed').toBeNull();
  });

  it('shows every section link where a pointer can reach it on a laptop-wide screen', () => {
    // Measured, not assumed: at 1440px the Download button once pushed "Devices"
    // under the search field and "Reference" out of the bar, and every unit test
    // still passed. elementFromPoint at each link's centre must find that link.
    expect(window.innerWidth).withContext('this spec needs the desktop layout (karma --window-size)').toBeGreaterThan(992);
    const links = Array.from(fixture.nativeElement.querySelectorAll('#primary-nav a')) as HTMLElement[];
    expect(links.length).toBe(SECTIONS.length);
    for (const a of links) {
      const r = a.getBoundingClientRect();
      const label = a.textContent!.trim();
      expect(r.width).withContext(`${label} width`).toBeGreaterThan(20);
      expect(r.right).withContext(`${label} right edge`).toBeLessThanOrEqual(window.innerWidth);
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      expect(hit === a || a.contains(hit)).withContext(`${label} is covered by ${hit?.outerHTML.slice(0, 60)}`).toBeTrue();
    }
    const dl = el('[data-testid="header-download"]').getBoundingClientRect();
    expect(dl.right).toBeLessThanOrEqual(window.innerWidth);
  });

  it('reports the disclosure state through aria-expanded', () => {
    const toggle = el('[data-testid="menu-toggle"]');
    expect(toggle.getAttribute('aria-expanded')).toBe('false');

    fixture.componentInstance.toggleMenu();
    fixture.detectChanges();
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
  });

  it('points the disclosure at the panel it controls', () => {
    expect(el('[data-testid="menu-toggle"]').getAttribute('aria-controls')).toBe('primary-nav');
    expect(el('#primary-nav')).toBeTruthy();
  });

  it('closes the menu after a section is chosen', () => {
    fixture.componentInstance.toggleMenu();
    fixture.componentInstance.closeMenu();
    expect(fixture.componentInstance.menuOpen()).toBeFalse();
  });

  it('hands a search off to the /search route with the query in the URL', () => {
    const navigate = spyOn(router, 'navigate').and.resolveTo(true);
    fixture.componentInstance.submitSearch(new Event('submit'), '  argocd  ');
    expect(navigate).toHaveBeenCalledWith(['/search'], { queryParams: { q: 'argocd' } });
  });

  it('navigates without a query param when the field is empty', () => {
    const navigate = spyOn(router, 'navigate').and.resolveTo(true);
    fixture.componentInstance.submitSearch(new Event('submit'), '   ');
    expect(navigate).toHaveBeenCalledWith(['/search'], {});
  });

  it('does not reload the page on submit', () => {
    const event = new Event('submit');
    const prevented = spyOn(event, 'preventDefault');
    spyOn(router, 'navigate').and.resolveTo(true);
    fixture.componentInstance.submitSearch(event, 'x');
    expect(prevented).toHaveBeenCalled();
  });

  it('gives the search field a label and the icon button an accessible name', () => {
    expect(fixture.nativeElement.querySelector('label[for="header-search"]')).toBeTruthy();
    expect(el('[data-testid="menu-toggle"]').textContent!.trim().length).toBeGreaterThan(0);
  });
});
