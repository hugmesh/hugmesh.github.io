import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { AsyncPipe } from '@angular/common';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { ContentService } from '../content/content.service';
import { SECTIONS } from '../content/sections';

/**
 * The per-section page rail, shown beside a document.
 *
 * It lists ONLY the current section's pages, not the whole corpus. A flat list of
 * every page across nine sections is 100+ entries — long enough that the rail
 * stops being navigation and becomes another thing to scroll past. Cross-section
 * movement is the header's job.
 */
@Component({
  selector: 'hug-sidebar',
  imports: [RouterLink, RouterLinkActive, AsyncPipe],
  templateUrl: './sidebar.component.html',
  styleUrl: './sidebar.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SidebarComponent {
  private readonly content = inject(ContentService);

  readonly section = input.required<string>();

  readonly index$ = this.content.index();
  private readonly index = toSignal(this.index$);

  readonly meta = computed(() => SECTIONS.find((s) => s.id === this.section()));

  readonly docs = computed(
    () => this.index()?.sections.find((s) => s.id === this.section())?.docs ?? [],
  );
}
