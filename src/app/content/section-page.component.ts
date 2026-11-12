import { ChangeDetectionStrategy, Component, computed, effect, inject } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { DomSanitizer, SafeHtml, Title, Meta } from '@angular/platform-browser';
import { toSignal } from '@angular/core/rxjs-interop';
import { map } from 'rxjs';
import { ContentService } from './content.service';
import { sectionMeta } from './sections';
import { navMap, resolveGroups } from './nav';

/**
 * A tab's landing page: what the tab is for, where to start, then its pages as
 * ordered groups of one-line rows.
 *
 * The intro HTML is rendered and sanitised at build time from landings/<id>.md
 * by scripts/build-content.mjs (the same allowlist as every page body), which is
 * why it is passed through bypassSecurityTrustHtml here.
 */
@Component({
  selector: 'hug-section-page',
  imports: [RouterLink],
  templateUrl: './section-page.component.html',
  styleUrl: './section-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SectionPageComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly content = inject(ContentService);
  private readonly sanitizer = inject(DomSanitizer);
  private readonly title = inject(Title);
  private readonly metaTag = inject(Meta);

  readonly id = toSignal(this.route.paramMap.pipe(map((p) => p.get('section') ?? '')), {
    initialValue: '',
  });

  readonly meta = computed(() => sectionMeta(this.id()));

  private readonly index = toSignal(this.content.index());

  /** Distinguishes "index has not arrived yet" from "the index arrived and this
   *  section has no published pages" — the template says something different for
   *  each, and conflating them produces the classic "empty page that might be
   *  broken" state. */
  readonly indexLoaded = computed(() => this.index() !== undefined);

  readonly section = computed(() => this.index()?.sections.find((s) => s.id === this.id()));

  private readonly map = computed(() => navMap(this.index()));

  readonly groups = computed(() => resolveGroups(this.section(), this.map()));

  readonly intro = computed<SafeHtml | null>(() => {
    const html = this.section()?.introHtml;
    return html ? this.sanitizer.bypassSecurityTrustHtml(html) : null;
  });

  /** Jump links only pay for themselves on a long tab. */
  readonly showJumps = computed(() => this.groups().length >= 4);

  constructor() {
    effect(() => {
      const meta = this.meta();
      if (!meta) return;
      this.title.setTitle(`${meta.title} — HugMesh Documentation`);
      this.metaTag.updateTag({ name: 'description', content: meta.blurb });
    });
  }
}
