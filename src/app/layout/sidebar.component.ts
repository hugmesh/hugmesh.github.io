import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { AsyncPipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { ContentService } from '../content/content.service';
import { SECTIONS } from '../content/sections';
import { navMap, resolveGroups } from '../content/nav';

/**
 * The per-tab page rail, shown beside a document.
 *
 * It lists ONLY the current tab's pages, under the same group headings and in the
 * same order as the tab's landing page. The tab is the page's nav home, not its
 * URL prefix, so a page Studio lists shows the Studio rail. Cross-tab movement is
 * the header's job.
 */
@Component({
  selector: 'hug-sidebar',
  imports: [RouterLink, AsyncPipe],
  templateUrl: './sidebar.component.html',
  styleUrl: './sidebar.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SidebarComponent {
  private readonly content = inject(ContentService);

  /** The tab whose pages to list. */
  readonly section = input.required<string>();
  /** The route of the page being read, marked as current. */
  readonly current = input<string>('');

  readonly index$ = this.content.index();
  private readonly index = toSignal(this.index$);

  readonly meta = computed(() => SECTIONS.find((s) => s.id === this.section()));

  readonly groups = computed(() => {
    const index = this.index();
    return resolveGroups(
      index?.sections.find((s) => s.id === this.section()),
      navMap(index),
    );
  });
}
