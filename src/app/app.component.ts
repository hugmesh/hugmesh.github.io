import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { DOCUMENT } from '@angular/common';
import { RouterOutlet } from '@angular/router';
import { BackgroundComponent } from './background/background.component';
import { HeaderComponent } from './layout/header.component';
import { FooterComponent } from './layout/footer.component';

@Component({
  selector: 'hug-root',
  imports: [RouterOutlet, BackgroundComponent, HeaderComponent, FooterComponent],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppComponent {
  private readonly doc = inject(DOCUMENT);

  /**
   * Skip-link handler. Moves FOCUS, not just the scroll position, to the routed
   * page's #maincontent — scrolling alone leaves a keyboard user's next Tab back
   * up in the navigation, which is the thing the skip link exists to avoid
   * (WCAG 2.4.1). Each routed page owns the #maincontent id.
   */
  skipToMain(event: Event): void {
    event.preventDefault();
    const main = this.doc.getElementById('maincontent');
    if (!main) return;
    if (main.getAttribute('tabindex') === null) main.setAttribute('tabindex', '-1');
    main.focus({ preventScroll: false });
    main.scrollIntoView();
  }
}
