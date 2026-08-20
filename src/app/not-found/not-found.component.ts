import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { SECTIONS } from '../content/sections';

/**
 * The 404 view.
 *
 * On GitHub Pages this is also what a cold load of ANY deep link initially hits:
 * Pages serves 404.html for every unknown path, and scripts/spa-fallback.mjs
 * makes 404.html a byte-copy of index.html so the app boots and the router
 * resolves the real route. By the time this component renders, routing has
 * already run and the path genuinely does not match anything.
 */
@Component({
  selector: 'hug-not-found',
  imports: [RouterLink],
  templateUrl: './not-found.component.html',
  styleUrl: './not-found.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NotFoundComponent {
  private readonly router = inject(Router);

  readonly sections = SECTIONS;
  readonly attempted = this.router.url;
}
