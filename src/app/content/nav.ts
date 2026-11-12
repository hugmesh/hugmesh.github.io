import { ContentIndex, DocSummary, NavGroup, SectionIndex } from './content.models';
import { SECTION_IDS } from './sections';

/**
 * Navigation derived from the content index.
 *
 * A tab's groups hold ROUTES, not pages, because a tab may list a page whose URL
 * sits under another section (its "nav home" differs from its URL prefix). So
 * every consumer resolves a route through one map built from all sections' docs.
 * The Downloads page is not a document, but Get started lists it as its first
 * step, so it has a fixed entry here.
 */
export const DOWNLOADS_SUMMARY: DocSummary = {
  slug: 'downloads',
  route: '/downloads',
  title: 'Download the Studio',
  summary: 'Get the Studio for Windows or Linux and check the download.',
  readingMinutes: 1,
};

export function navMap(index: ContentIndex | undefined | null): Map<string, DocSummary> {
  const map = new Map<string, DocSummary>();
  for (const s of index?.sections ?? []) {
    for (const d of s.docs) map.set(d.route, { ...d, navSection: d.navSection ?? s.id });
  }
  map.set(DOWNLOADS_SUMMARY.route, DOWNLOADS_SUMMARY);
  return map;
}

export interface ResolvedGroup extends Omit<NavGroup, 'routes'> {
  readonly docs: readonly DocSummary[];
}

/** A tab's groups with each route resolved; a route the map lacks is skipped. */
export function resolveGroups(section: SectionIndex | undefined, map: Map<string, DocSummary>): ResolvedGroup[] {
  return (section?.groups ?? []).map((g) => ({
    id: g.id,
    title: g.title,
    blurb: g.blurb,
    docs: g.routes.map((r) => map.get(r)).filter((d): d is DocSummary => !!d),
  }));
}

/** The tab a route belongs to in the navigation: a section index is its own
 *  tab, a document is its nav home, anything else has none. */
export function navSectionOf(path: string, index: ContentIndex | undefined | null, map?: Map<string, DocSummary>): string | null {
  const clean = path.split(/[?#]/)[0].replace(/\/+$/, '') || '/';
  const segments = clean.split('/').filter(Boolean);
  if (!SECTION_IDS.includes(segments[0] ?? '')) return null;
  if (segments.length === 1) return segments[0];
  if (segments.length === 2) return (map ?? navMap(index)).get(clean)?.navSection ?? segments[0];
  return null;
}

/** Previous and next page in reading order within the page's nav-home tab.
 *  Standalone routes (/downloads) are not pages and are skipped. */
export function siblingsOf(route: string, index: ContentIndex | undefined | null, map?: Map<string, DocSummary>) {
  const m = map ?? navMap(index);
  const home = m.get(route)?.navSection;
  const section = index?.sections.find((s) => s.id === home);
  const order = resolveGroups(section, m)
    .flatMap((g) => g.docs)
    .filter((d) => d.route !== DOWNLOADS_SUMMARY.route);
  const i = order.findIndex((d) => d.route === route);
  return {
    prev: i > 0 ? order[i - 1] : null,
    next: i >= 0 && i < order.length - 1 ? order[i + 1] : null,
  };
}
