import { ChangeDetectionStrategy, Component, computed, effect, inject } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { toSignal } from '@angular/core/rxjs-interop';
import { map, switchMap } from 'rxjs';
import { ContentService } from './content.service';
import { SectionIndex } from './content.models';
import { sectionMeta } from './sections';

/** The landing page for one section: its blurb and a card per published page. */
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
  private readonly title = inject(Title);
  private readonly metaTag = inject(Meta);

  readonly id = toSignal(this.route.paramMap.pipe(map((p) => p.get('section') ?? '')), {
    initialValue: '',
  });

  readonly meta = computed(() => sectionMeta(this.id()));

  readonly section = toSignal(
    this.route.paramMap.pipe(
      switchMap((p) => this.content.section(p.get('section') ?? '')),
      map((s): SectionIndex | undefined => s),
    ),
    { initialValue: undefined },
  );

  /** Distinguishes "index has not arrived yet" from "the index arrived and this
   *  section has no published pages" — the template says something different for
   *  each, and conflating them produces the classic "empty page that might be
   *  broken" state. */
  readonly indexLoaded = toSignal(this.content.index().pipe(map(() => true)), {
    initialValue: false,
  });

  constructor() {
    effect(() => {
      const meta = this.meta();
      if (!meta) return;
      this.title.setTitle(`${meta.title} — HugMesh Documentation`);
      this.metaTag.updateTag({ name: 'description', content: meta.blurb });
    });
  }
}
