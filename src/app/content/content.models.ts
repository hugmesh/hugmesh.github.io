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
}

export interface SectionIndex {
  readonly id: string;
  readonly title: string;
  readonly blurb: string;
  readonly docs: readonly DocSummary[];
}

/** assets/content/index.json */
export interface ContentIndex {
  readonly generatedFrom: string;
  readonly sectionOrder: readonly string[];
  readonly sections: readonly SectionIndex[];
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
  readonly title: string;
  readonly summary: string;
  readonly headings: readonly string[];
  readonly text: string;
}
