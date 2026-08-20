import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Title } from '@angular/platform-browser';
import { toSignal } from '@angular/core/rxjs-interop';
import { map } from 'rxjs';
import { ContentService } from '../content/content.service';
import { sectionMeta } from '../content/sections';
import { search } from './search';

/**
 * Full-page search over assets/content/search.json.
 *
 * The index is fetched HERE and nowhere else — it is the largest asset the site
 * ships, and a reader who never searches must never download it. The query lives
 * in the URL (`?q=`) so a search result is a shareable, bookmarkable link and the
 * back button behaves.
 */
@Component({
  selector: 'hug-search',
  imports: [RouterLink],
  templateUrl: './search.component.html',
  styleUrl: './search.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SearchComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly content = inject(ContentService);
  private readonly title = inject(Title);

  readonly query = toSignal(this.route.queryParamMap.pipe(map((p) => p.get('q') ?? '')), {
    initialValue: '',
  });

  private readonly docs = toSignal(this.content.searchIndex(), { initialValue: undefined });

  readonly loading = computed(() => this.docs() === undefined);

  readonly hits = computed(() => {
    const docs = this.docs();
    const q = this.query().trim();
    if (!docs || !q) return [];
    return search(docs, q);
  });

  readonly liveMessage = signal('');

  constructor() {
    effect(() => {
      const q = this.query().trim();
      this.title.setTitle(q ? `${q} — Search — HugMesh Documentation` : 'Search — HugMesh Documentation');

      if (this.loading() || !q) {
        this.liveMessage.set('');
        return;
      }
      const n = this.hits().length;
      // Announced politely rather than rendered as the only feedback: a sighted
      // reader sees the list appear, a screen-reader user otherwise gets nothing
      // when the results swap under a field they are still focused in.
      this.liveMessage.set(n === 1 ? '1 result' : `${n} results`);
    });
  }

  submit(event: Event, value: string): void {
    event.preventDefault();
    const q = value.trim();
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: q ? { q } : {},
      // replaceUrl keeps the history stack from filling with one entry per
      // keystroke-and-submit, so Back returns to the page you came FROM.
      replaceUrl: true,
    });
  }

  sectionTitle(id: string): string {
    return sectionMeta(id)?.title ?? id;
  }
}
