import {
  ApplicationConfig,
  provideZonelessChangeDetection,
  provideBrowserGlobalErrorListeners,
} from '@angular/core';
import { provideRouter, withInMemoryScrolling, withRouterConfig } from '@angular/router';
import { provideHttpClient, withFetch } from '@angular/common/http';
import { routes } from './app.routes';
import { provideAnchorOffset } from './scroll-offset';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    // ZONELESS. Every component here is OnPush and every piece of state is a
    // signal or an async pipe, which is exactly the shape zoneless requires —
    // so zone.js buys nothing and costs a ~35 KB polyfill plus a monkey-patch of
    // every async API in the browser. Dropping it also removes the zone-testing
    // shim, which jasmine 7 refuses to load at all (it freezes its own globals).
    provideZonelessChangeDetection(),
    provideRouter(
      routes,
      // anchorScrolling is what makes a deep link like
      // /developer-guide/argocd-gitops#applicationset land ON the heading rather
      // than at the top of the page; the offset is handled in CSS via
      // scroll-padding-top so it clears the sticky header.
      withInMemoryScrolling({ anchorScrolling: 'enabled', scrollPositionRestoration: 'enabled' }),
      // Route params change without the component being recreated when moving
      // between two docs in the same section (/tutorials/a -> /tutorials/b), so
      // the page component subscribes to paramMap rather than reading it once.
      withRouterConfig({ paramsInheritanceStrategy: 'always' }),
    ),
    provideHttpClient(withFetch()),
    // Anchors land below the sticky header, not under it (scroll-offset.ts).
    provideAnchorOffset(),
  ],
};
