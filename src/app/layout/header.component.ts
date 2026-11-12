import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterLinkActive } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { filter, map, startWith } from 'rxjs';
import { CLUSTERS, SECTIONS } from '../content/sections';
import { ContentService } from '../content/content.service';
import { navMap, navSectionOf } from '../content/nav';

/**
 * The site's top bar: wordmark, primary section nav, a search entry point and the
 * GitHub link.
 *
 * The tabs sit in four clusters (Learn, Use, Reference, Build on it) with a thin
 * divider between them; the phone menu prints the cluster names. The active tab is
 * the current page's NAV HOME, not its URL prefix: a page Studio lists lights the
 * Studio tab even though its URL starts /operations/.
 *
 * On narrow viewports the section nav collapses behind a disclosure button. The
 * panel is rendered with @if rather than hidden with CSS so its links leave the
 * tab order entirely when collapsed — a nav you can tab into but cannot see is a
 * worse failure than one that is simply absent.
 */
@Component({
  selector: 'hug-header',
  imports: [RouterLink, RouterLinkActive],
  templateUrl: './header.component.html',
  styleUrl: './header.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HeaderComponent {
  private readonly router = inject(Router);
  private readonly content = inject(ContentService);

  readonly sections = SECTIONS;
  readonly clusters = CLUSTERS.map((c) => ({ ...c, sections: SECTIONS.filter((s) => s.cluster === c.id) }));
  readonly menuOpen = signal(false);

  private readonly url = toSignal(
    this.router.events.pipe(
      filter((e): e is NavigationEnd => e instanceof NavigationEnd),
      map((e) => e.urlAfterRedirects),
      startWith(this.router.url),
    ),
    { initialValue: this.router.url },
  );
  private readonly index = toSignal(this.content.index());
  private readonly map = computed(() => navMap(this.index()));

  /** The tab to mark as current: the section index itself, or the page's nav home. */
  readonly activeSection = computed(() => navSectionOf(this.url(), this.index(), this.map()));

  toggleMenu(): void {
    this.menuOpen.update((v) => !v);
  }

  closeMenu(): void {
    this.menuOpen.set(false);
  }

  /** Submitting the header field hands off to the /search route, which owns the
   *  index fetch and the result rendering. The header never fetches search.json
   *  itself — it is the largest asset on the site and most readers never search. */
  submitSearch(event: Event, query: string): void {
    event.preventDefault();
    const q = query.trim();
    this.closeMenu();
    void this.router.navigate(['/search'], q ? { queryParams: { q } } : {});
  }
}
