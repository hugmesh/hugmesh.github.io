import { Routes, UrlSegment } from '@angular/router';
import { routes } from './app.routes';
import { SECTION_IDS, SECTIONS } from './content/sections';

/**
 * The route table is DATA-DRIVEN: documentation pages are not enumerated here,
 * they are resolved at runtime from the generated content index. What these
 * specs lock in is the shape that makes that safe — that only known sections are
 * matched, that the two-segment document route exists, and that the catch-all is
 * genuinely last.
 */
describe('app routes', () => {
  const seg = (...parts: string[]) => parts.map((p) => new UrlSegment(p, {}));
  const find = (path: string) => routes.find((r) => r.path === path);
  const matcherFor = (index: number) => routes[index].matcher!;

  const sectionRoute = routes.find((r) => r.matcher && r.path === ':section')!;
  const docRoute = routes.find((r) => r.matcher && r.path === ':section/:slug')!;

  it('serves the home page at the empty path, matched exactly', () => {
    const home = find('');
    expect(home).toBeDefined();
    // Without pathMatch:'full' the empty path prefix-matches EVERY url and the
    // home page would render instead of any document.
    expect(home!.pathMatch).toBe('full');
  });

  it('exposes the standalone pages the header and footer link to', () => {
    expect(find('search')).toBeDefined();
    expect(find('downloads')).toBeDefined();
  });

  it('matches a section index only for a known section', () => {
    for (const id of SECTION_IDS) {
      expect(sectionRoute.matcher!(seg(id), null!, null!))
        .withContext(`section ${id} should match`)
        .not.toBeNull();
    }
    expect(sectionRoute.matcher!(seg('not-a-section'), null!, null!)).toBeNull();
  });

  it('does not let the section route swallow a two-segment document path', () => {
    expect(sectionRoute.matcher!(seg('tutorials', 'first-run'), null!, null!)).toBeNull();
  });

  it('matches a document path and exposes both parameters', () => {
    const matched = docRoute.matcher!(seg('tutorials', 'first-run'), null!, null!);
    expect(matched).not.toBeNull();
    expect(matched!.posParams!['section'].path).toBe('tutorials');
    expect(matched!.posParams!['slug'].path).toBe('first-run');
  });

  it('rejects a document path under an unknown section', () => {
    expect(docRoute.matcher!(seg('nope', 'first-run'), null!, null!)).toBeNull();
  });

  it('rejects a three-segment path rather than matching it as a document', () => {
    expect(docRoute.matcher!(seg('tutorials', 'a', 'b'), null!, null!)).toBeNull();
  });

  it('keeps the catch-all last, where it cannot shadow a real route', () => {
    const wildcard = routes.findIndex((r) => r.path === '**');
    expect(wildcard).toBe(routes.length - 1);
  });

  it('lazy-loads every routed component, so no page is in the initial bundle', () => {
    const routed = (routes as Routes).filter((r) => r.path !== undefined || r.matcher);
    for (const route of routed) {
      expect(typeof route.loadComponent)
        .withContext(`route ${route.path} should lazy-load`)
        .toBe('function');
    }
  });

  it('has a section entry for every id the matchers accept', () => {
    expect(SECTIONS.map((s) => s.id)).toEqual([...SECTION_IDS]);
  });

  void matcherFor;
});
