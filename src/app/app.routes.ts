import { Routes } from '@angular/router';
import { SECTION_IDS } from './content/sections';

/**
 * Site routes.
 *
 * Every documentation page is `/:section/:slug`, resolved at runtime against the
 * generated `assets/content/index.json` — the route table does NOT enumerate
 * pages. That is deliberate: pages come and go as docs.manifest.json changes, and
 * a hand-maintained route per page would drift the moment somebody adds one.
 * What IS enumerated is the SECTION list (content/sections.ts, generated-checked
 * against the manifest by a spec), so an unknown section 404s immediately instead
 * of firing a doomed fetch.
 *
 * GitHub Pages has no server-side rewrite, so a cold load of a deep link is
 * served `404.html` — which scripts/spa-fallback.mjs makes a byte-copy of
 * index.html. The app then boots and the router resolves the path normally. That
 * is the whole SPA-on-Pages trick, and it is why `useHash` is not needed.
 */
export const routes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    loadComponent: () => import('./home/home.component').then((m) => m.HomeComponent),
    title: 'HugMesh Documentation',
  },
  {
    path: 'search',
    loadComponent: () => import('./search/search.component').then((m) => m.SearchComponent),
    title: 'Search — HugMesh Documentation',
  },
  {
    path: 'downloads',
    loadComponent: () =>
      import('./downloads/downloads.component').then((m) => m.DownloadsComponent),
    title: 'Download HugMesh Studio — HugMesh Documentation',
  },
  {
    // Section index, e.g. /tutorials. Guarded by the closed section list so a
    // typo'd URL takes the 404 route instead of rendering an empty section.
    path: ':section',
    matcher: (segments) =>
      segments.length === 1 && SECTION_IDS.includes(segments[0].path)
        ? { consumed: segments, posParams: { section: segments[0] } }
        : null,
    loadComponent: () =>
      import('./content/section-page.component').then((m) => m.SectionPageComponent),
  },
  {
    // A single document, e.g. /developer-guide/argocd-gitops.
    path: ':section/:slug',
    matcher: (segments) =>
      segments.length === 2 && SECTION_IDS.includes(segments[0].path)
        ? { consumed: segments, posParams: { section: segments[0], slug: segments[1] } }
        : null,
    loadComponent: () => import('./content/doc-page.component').then((m) => m.DocPageComponent),
  },
  {
    path: '**',
    loadComponent: () => import('./not-found/not-found.component').then((m) => m.NotFoundComponent),
    title: 'Page not found — HugMesh Documentation',
  },
];
