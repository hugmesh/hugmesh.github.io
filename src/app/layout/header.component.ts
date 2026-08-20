import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import { SECTIONS } from '../content/sections';

/**
 * The site's top bar: wordmark, primary section nav, a search entry point and the
 * GitHub link.
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

  readonly sections = SECTIONS;
  readonly menuOpen = signal(false);

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
