import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { DOCUMENT } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { DomSanitizer, SafeHtml, Title, Meta } from '@angular/platform-browser';
import { toSignal } from '@angular/core/rxjs-interop';
import { map, switchMap } from 'rxjs';
import { ContentService } from './content.service';
import { DocPage, DocSummary } from './content.models';
import { SidebarComponent } from '../layout/sidebar.component';
import { sectionMeta } from './sections';
import { loadMermaid } from './mermaid-loader';

/**
 * Renders one documentation page.
 *
 * The body arrives as HTML that scripts/build-content.mjs already ran through a
 * strict tag/attribute allowlist, which is why it is passed through
 * `bypassSecurityTrustHtml` here. That call is only defensible BECAUSE the
 * sanitising happened at build time on content the repository controls — it is
 * not a shortcut around Angular's sanitiser for arbitrary input, and if this
 * component ever renders markdown from somewhere else, the bypass has to go.
 */
@Component({
  selector: 'hug-doc-page',
  imports: [RouterLink, SidebarComponent],
  templateUrl: './doc-page.component.html',
  styleUrl: './doc-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DocPageComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly content = inject(ContentService);
  private readonly sanitizer = inject(DomSanitizer);
  private readonly title = inject(Title);
  private readonly meta = inject(Meta);
  private readonly doc = inject(DOCUMENT);
  private readonly router = inject(Router);

  protected readonly params = toSignal(
    this.route.paramMap.pipe(
      map((p) => ({ section: p.get('section') ?? '', slug: p.get('slug') ?? '' })),
    ),
    { initialValue: { section: '', slug: '' } },
  );

  /** `undefined` = still loading, `null` = no such page. The template tells those
   *  apart, because "loading" and "gone" deserve different words. */
  readonly page = toSignal(
    this.route.paramMap.pipe(
      switchMap((p) => this.content.page(p.get('section') ?? '', p.get('slug') ?? '')),
      // Widen to include the loading sentinel: toSignal requires initialValue to
      // be assignable to what the source emits, so `undefined` has to be part of
      // the source's type rather than only of the option.
      map((doc): DocPage | null | undefined => doc),
    ),
    { initialValue: undefined },
  );

  private readonly index = toSignal(this.content.index());

  readonly section = computed(() => this.params().section);
  readonly sectionTitle = computed(() => sectionMeta(this.section())?.title ?? this.section());

  readonly body = computed<SafeHtml | null>(() => {
    const html = this.page()?.html;
    return html ? this.sanitizer.bypassSecurityTrustHtml(html) : null;
  });

  /** Previous/next within the section, so a reader can walk a tutorial track
   *  without going back to the index between every step. */
  readonly siblings = computed(() => {
    const docs = this.index()?.sections.find((s) => s.id === this.section())?.docs ?? [];
    const i = docs.findIndex((d) => d.slug === this.params().slug);
    return {
      prev: i > 0 ? docs[i - 1] : (null as DocSummary | null),
      next: i >= 0 && i < docs.length - 1 ? docs[i + 1] : (null as DocSummary | null),
    };
  });

  readonly mermaidFailed = signal(false);

  constructor() {
    effect(() => {
      const page = this.page();
      if (!page) return;

      this.title.setTitle(`${page.title} — HugMesh Documentation`);
      this.meta.updateTag({ name: 'description', content: page.summary });

      // Mermaid is fetched ONLY for pages that actually contain a diagram, and
      // only after the body is in the DOM. A page that has none never pays for
      // the library; a page whose diagram fails to render keeps the readable
      // source block that .prose styles (see _prose.scss).
      if (page.hasMermaid) queueMicrotask(() => void this.renderDiagrams());
    });
  }

  /**
   * Links inside the rendered Markdown are plain <a href> (innerHTML has no
   * RouterLink), so without this every click on a cross-reference reloaded the
   * whole app. A plain left click on a link to this site is handed to the
   * router instead; anything else (new tab, modifier keys, external, downloads,
   * the /assets payload) is left to the browser. An anchor on the page itself
   * scrolls even when it is already the current fragment.
   */
  onProseClick(event: MouseEvent): void {
    if (event.defaultPrevented || event.button !== 0) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const a = (event.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null;
    if (!a || (a.target && a.target !== '_self') || a.hasAttribute('download')) return;
    const win = this.doc.defaultView;
    if (!win) return;
    const url = new URL(a.href, win.location.href);
    if (url.origin !== win.location.origin || url.pathname.startsWith('/assets/')) return;
    event.preventDefault();
    const target = `${url.pathname}${url.search}${url.hash}`;
    const here = `${win.location.pathname}${win.location.search}${win.location.hash}`;
    if (target === here && url.hash) {
      this.doc.getElementById(decodeURIComponent(url.hash.slice(1)))?.scrollIntoView();
      return;
    }
    void this.router.navigateByUrl(target);
  }

  private async renderDiagrams(): Promise<void> {
    const nodes = this.doc.querySelectorAll<HTMLElement>('.prose pre.mermaid:not([data-processed])');
    if (nodes.length === 0) return;
    try {
      const mermaid = await loadMermaid();
      await mermaid.run({ nodes: Array.from(nodes) });
    } catch {
      this.mermaidFailed.set(true);
    }
  }
}
