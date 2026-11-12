/** Shapes emitted by scripts/build-content.mjs into src/assets/content/. */

export interface DocSource {
  readonly repo: string;
  readonly path: string;
  /** The upstream commit the vendored copy was taken from, when known. */
  readonly ref: string | null;
  /**
   * A link to the file on GitHub, or `null`.
   *
   * The build emits `null` whenever `meta.sourcesArePublic` is false in
   * docs.manifest.json — which is the case today, because every hugmesh-* code
   * repository is private while this site is public. Rendering a github.com URL
   * then would give every visitor a 404, so the page names its source without
   * linking it. Consumers MUST handle null.
   */
  readonly url: string | null;
}

/**
 * An upstream file a page written for this site was last checked against, and the
 * commit it was read at. `url` links the file at that commit, or is `null` under
 * the same rule as DocSource.url.
 */
export interface DocBasis {
  readonly repo: string;
  readonly path: string;
  readonly ref: string;
  readonly url: string | null;
}

export interface TocEntry {
  readonly id: string;
  readonly level: 2 | 3;
  readonly text: string;
}

/** One rendered page: assets/content/<section>/<slug>.json */
export interface DocPage {
  readonly section: string;
  readonly slug: string;
  readonly route: string;
  readonly title: string;
  readonly summary: string;
  readonly hasMermaid: boolean;
  readonly readingMinutes: number;
  readonly toc: readonly TocEntry[];
  readonly source: DocSource | null;
  /** For a page written here: the upstream files it was checked against. Empty for
   *  a vendored page (it has `source`) and for a page that tracks no upstream file. */
  readonly basis?: readonly DocBasis[];
  /** Sanitised at BUILD time (scripts/build-content.mjs). */
  readonly html: string;
}

/** A page as it appears in the nav, without its body. */
export interface DocSummary {
  readonly slug: string;
  readonly route: string;
  readonly title: string;
  readonly summary: string;
  readonly readingMinutes: number;
  /** The tab that lists this page (its "nav home"). Usually the URL section, but
   *  not always: /operations/resource-limits is listed under Studio. Breadcrumbs,
   *  the sidebar, prev/next and the active header tab all follow this, never the
   *  URL prefix. Optional only so a hand-built fixture can leave it out. */
  readonly navSection?: string;
  /** The id of the group inside that tab. */
  readonly navGroup?: string;
}

/** One group of pages on a tab, in reading order. Routes only: resolve each
 *  through the route -> DocSummary map (navMap in content/nav.ts). */
export interface NavGroup {
  readonly id: string;
  readonly title: string;
  readonly blurb: string | null;
  readonly routes: readonly string[];
}

export interface SectionIndex {
  readonly id: string;
  readonly title: string;
  readonly blurb: string;
  readonly cluster?: string;
  /** The tab's intro, rendered and sanitised at build time from landings/<id>.md. */
  readonly introHtml?: string;
  /** The obvious first page of the tab, when it has one. */
  readonly start?: { readonly route: string; readonly title: string } | null;
  /** A page whose headings make a useful index on the tab (Troubleshooting). */
  readonly index?: {
    readonly route: string;
    readonly entries: readonly { readonly id: string; readonly text: string; readonly level?: number }[];
  };
  readonly groups?: readonly NavGroup[];
  /** Every page whose URL starts /<id>/, wherever it is listed. */
  readonly docs: readonly DocSummary[];
}

/** assets/content/index.json */
export interface ContentIndex {
  readonly generatedFrom: string;
  readonly sectionOrder: readonly string[];
  readonly sections: readonly SectionIndex[];
  /** Retired URL -> where its content went (route, optionally with #fragment). */
  readonly redirects?: Readonly<Record<string, string>>;
  readonly totals: {
    readonly sections: number;
    readonly pages: number;
    /** Mermaid diagrams across every page. Optional because a stale
     *  index.json predates the field — the front door renders nothing
     *  rather than a zero when it is missing. */
    readonly diagrams?: number;
  };
}

/** One entry of assets/content/search.json */
export interface SearchDoc {
  readonly route: string;
  readonly section: string;
  /** The tab that lists the page, when it differs from the URL section. */
  readonly navSection?: string;
  readonly title: string;
  readonly summary: string;
  readonly headings: readonly string[];
  readonly text: string;
}
