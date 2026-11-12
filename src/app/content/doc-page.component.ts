import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  Injector,
  afterNextRender,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { DOCUMENT } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { DomSanitizer, SafeHtml, Title, Meta } from '@angular/platform-browser';
import { toSignal } from '@angular/core/rxjs-interop';
import { map, of, switchMap } from 'rxjs';
import { ContentService } from './content.service';
import { DocPage } from './content.models';
import { SidebarComponent } from '../layout/sidebar.component';
import { sectionMeta } from './sections';
import { navMap, siblingsOf } from './nav';
import { loadMermaid } from './mermaid-loader';
import { type AnchorSettle, settleOnAnchor } from './anchor-settle';

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
  private readonly injector = inject(Injector);
  private readonly destroyRef = inject(DestroyRef);

  /** The URL's #fragment. Read once the page body exists: the router's own
   *  anchor scroll fires at NavigationEnd, before the document has been fetched,
   *  so a cold-loaded /page#heading or a link from another page found nothing
   *  to scroll to and stayed at the top. */
  private readonly fragment = toSignal(this.route.fragment ?? of(null), { initialValue: null });

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
  private readonly map = computed(() => navMap(this.index()));

  /** The URL's section: where the page's JSON lives. */
  readonly section = computed(() => this.params().section);
  readonly path = computed(() => `/${this.params().section}/${this.params().slug}`);

  /** The tab that LISTS this page, which is where the reader thinks they are: the
   *  breadcrumb, the sidebar and prev/next follow it, not the URL prefix. A page
   *  under /operations/ that Studio lists reads as part of Studio. */
  readonly navSection = computed(() => this.map().get(this.path())?.navSection ?? this.section());
  readonly sectionTitle = computed(() => sectionMeta(this.navSection())?.title ?? this.navSection());

  readonly body = computed<SafeHtml | null>(() => {
    const html = this.page()?.html;
    return html ? this.sanitizer.bypassSecurityTrustHtml(html) : null;
  });

  /** Previous/next in the reading order of the page's tab, so a reader can walk a
   *  tutorial track without going back to the index between every step. */
  readonly siblings = computed(() => siblingsOf(this.path(), this.index(), this.map()));

  /** Reading time only where it helps decide whether to start now. */
  readonly showReadingTime = computed(() => (this.page()?.readingMinutes ?? 0) >= 5);

  /** Set while a retired URL is being sent on to its replacement, so the "moved
   *  or removed" state does not flash first. */
  readonly redirecting = signal(false);

  readonly mermaidFailed = signal(false);

  constructor() {
    this.destroyRef.onDestroy(() => this.settle?.stop());

    // A retired URL: the page file is gone, and index.json says where its content
    // went. Follow it in place (replaceUrl, so Back does not bounce the reader
    // into the redirect again), keeping a #fragment the link carried. The static
    // redirect page in the build only matters for a cold load or a crawler.
    effect(() => {
      if (this.page() !== null) {
        this.redirecting.set(false);
        return;
      }
      const index = this.index();
      if (!index) return;
      const to = index.redirects?.[this.path()];
      if (!to) return;
      this.redirecting.set(true);
      const fragment = untracked(this.fragment);
      const target = to.includes('#') || !fragment ? to : `${to}#${fragment}`;
      void this.router.navigateByUrl(target, { replaceUrl: true });
    });

    effect(() => {
      const page = this.page();
      if (!page) return;

      this.title.setTitle(`${page.title} — HugMesh Documentation`);

      const fragment = untracked(this.fragment);
      if (fragment) {
        afterNextRender(() => this.jumpTo(fragment), { injector: this.injector });
      }
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
      // Already the current URL, so the router will not scroll: do it here, with
      // the same header offset the router uses.
      this.jumpTo(decodeURIComponent(url.hash.slice(1)));
      return;
    }
    void this.router.navigateByUrl(target);
  }

  /** The heading this page is holding in view while it settles, if any. */
  private settle: AnchorSettle | null = null;

  /**
   * Jump to a heading when the page arrives with a #fragment, and keep it in
   * view while fonts and diagrams change the layout (anchor-settle.ts).
   */
  private jumpTo(fragment: string): void {
    this.settle?.stop();
    this.settle = settleOnAnchor(this.doc, fragment, this.doc.querySelector('main.doc'));
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
    // Drawn diagrams are taller or shorter than their source blocks: keep a
    // heading the page was opened at in view.
    this.settle?.rejump();
  }
}
