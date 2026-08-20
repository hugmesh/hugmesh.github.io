import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { SECTIONS } from '../content/sections';

@Component({
  selector: 'hug-footer',
  imports: [RouterLink],
  templateUrl: './footer.component.html',
  styleUrl: './footer.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FooterComponent {
  readonly sections = SECTIONS;
  /** Rendered as a static string rather than `new Date()`: the site is a static
   *  build, so a client-side year would silently disagree with the copy in the
   *  build artefact and with search-engine caches. */
  readonly year = '2026';
}
