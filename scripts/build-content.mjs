#!/usr/bin/env node
/**
 * Render the vendored `content/` tree into the static payload the Angular app
 * fetches at runtime:
 *
 *   src/assets/content/index.json           nav tree + per-page metadata
 *   src/assets/content/<section>/<slug>.json  { html, toc, source, ... }
 *   src/assets/content/search.json          client-side search index
 *
 * Markdown is rendered and SANITISED HERE, at build time, not in the browser.
 * That keeps the shipped bundle free of a markdown parser, keeps highlight.js
 * out of the client entirely, and means the app never has to bypass Angular's
 * sanitiser on anything a build step did not already vet.
 */
import { readFile, writeFile, mkdir, rm, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Marked } from 'marked';
import GithubSlugger from 'github-slugger';
import sanitizeHtml from 'sanitize-html';
import hljs from 'highlight.js';
import { loadManifest, groupBySection, SECTIONS } from './lib/manifest.mjs';
import { parseFrontMatter } from './lib/frontmatter.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'src/assets/content');
const ORG_URL = 'https://github.com/hugmesh';

/**
 * Whether the code repositories are readable by the public.
 *
 * They are NOT, today: all 38 hugmesh-* repos are private while this site is
 * public. That single fact decides how two things render.
 *
 *   - A relative `./OTHER.md` link whose target is not published here would
 *     naturally become a github.com blob URL. Against a private repo that is a
 *     404 for every visitor, so instead the link text is kept and the link is
 *     dropped. Manufacturing a dead link is worse than not linking.
 *   - The per-page provenance line ("generated from repo/path") renders as text
 *     rather than as a link, for the same reason.
 *
 * Links an AUTHOR wrote as absolute github.com URLs are left exactly as written.
 * Rewriting somebody's deliberate link is a different thing from declining to
 * invent one, and those URLs come good the day a repo is made public.
 *
 * ONE exception, in resolveLink: the `hugmesh-net` org slug. That promise --
 * "it comes good when the repo opens" -- is what earns author links their
 * pass-through, and `hugmesh-net` cannot keep it, because it is not a private
 * account but no account at all. Those are rewritten to `hugmesh` and WARNED
 * about, so the upstream typo stays visible instead of being laundered away.
 *
 * Flip this to `true` (or set `meta.sourcesArePublic` in docs.manifest.json) once
 * the repos are public, and both behaviours become links again with no other
 * change.
 */
let sourcesArePublic = false;

/** Languages we hand to highlight.js. Anything else is emitted as a plain code
 *  block rather than guessed at — `hljs.highlightAuto` mislabels short shell
 *  snippets as Perl often enough to be worse than no colour at all. */
const HIGHLIGHT_ALIASES = new Map([
  ['sh', 'bash'], ['shell', 'bash'], ['bash', 'bash'], ['console', 'bash'], ['zsh', 'bash'],
  ['yaml', 'yaml'], ['yml', 'yaml'],
  ['json', 'json'], ['jsonc', 'json'],
  ['ts', 'typescript'], ['typescript', 'typescript'],
  ['js', 'javascript'], ['javascript', 'javascript'],
  ['py', 'python'], ['python', 'python'],
  ['java', 'java'], ['kotlin', 'kotlin'], ['groovy', 'groovy'],
  ['xml', 'xml'], ['html', 'xml'], ['svg', 'xml'],
  ['sql', 'sql'], ['ini', 'ini'], ['toml', 'ini'], ['conf', 'ini'],
  ['dockerfile', 'dockerfile'], ['docker', 'dockerfile'],
  ['diff', 'diff'], ['patch', 'diff'],
  ['nix', 'nix'], ['make', 'makefile'], ['makefile', 'makefile'],
  ['powershell', 'powershell'], ['ps1', 'powershell'], ['bat', 'dos'], ['cmd', 'dos'],
  ['css', 'css'], ['scss', 'scss'],
]);

/**
 * Build the renderer for one page. A fresh Marked instance per page keeps the
 * heading-id counter from leaking between documents (two pages that both have an
 * "## Overview" would otherwise get `overview` and `overview-1`, and the second
 * page's own anchor links would 404 against its own TOC).
 */
function createRenderer({ routeFor, isSiteRoute, entry, warn }) {
  const marked = new Marked({ gfm: true, breaks: false });
  // One slugger per PAGE, so two documents that both have an '## Overview' each
  // get `overview` — a shared counter would give the second `overview-1` and
  // break its own TOC links.
  const slugger = new GithubSlugger();
  const headings = [];

  marked.use({
    renderer: {
      heading({ tokens, depth }) {
        const text = this.parser.parseInline(tokens);
        const plain = this.parser.parseInline(tokens, this.parser.textRenderer);
        const id = slugger.slug(plain);
        // H2/H3 get a permalink. It is a REAL link with an accessible name, so it
        // is always in the a11y tree; .prose reveals it visually on hover/focus
        // rather than leaving every heading permanently cluttered.
        const anchor =
          depth === 2 || depth === 3
            ? `<a class="heading-anchor" href="#${id}" aria-label="Link to this section: ${escapeHtml(plain)}">#</a>`
            : '';
        if (depth === 2 || depth === 3) headings.push({ id, level: depth, text: plain });
        return `<h${depth} id="${id}">${anchor}${text}</h${depth}>\n`;
      },

      code({ text, lang }) {
        const info = (lang ?? '').trim().split(/\s+/)[0].toLowerCase();

        // Mermaid is the ONE case left for the client: the diagram source is
        // handed through untouched inside <pre class="mermaid">, and the app
        // lazy-loads mermaid only on pages that contain one. Rendering it here
        // would mean a headless browser in the Pages build for a handful of
        // diagrams.
        if (info === 'mermaid') {
          return `<pre class="mermaid">${escapeHtml(text)}</pre>`;
        }

        const language = HIGHLIGHT_ALIASES.get(info);
        const body = language
          ? hljs.highlight(text, { language, ignoreIllegals: true }).value
          : escapeHtml(text);
        const cls = language ? ` class="language-${language}"` : '';
        const label = info ? ` data-lang="${escapeHtml(info)}"` : '';
        return `<pre class="code-block"${label}><code${cls}>${body}</code></pre>\n`;
      },

      link({ href, title, tokens }) {
        const text = this.parser.parseInline(tokens);
        const resolved = resolveLink(href, { routeFor, isSiteRoute, entry, warn });

        // No destination a visitor can actually reach: keep the words, drop the
        // link, and say why on hover. A link that 404s for everyone is worse
        // than prose.
        if (!resolved.href) {
          return `<span class="unpublished" title="${escapeHtml(resolved.unpublished)} is not published on this site">${text}</span>`;
        }

        const attrs = [`href="${escapeHtml(resolved.href)}"`];
        if (title) attrs.push(`title="${escapeHtml(title)}"`);
        if (resolved.external) {
          // rel is not decoration here: target=_blank without noopener hands the
          // opened page a live window.opener handle back into this document.
          attrs.push('target="_blank"', 'rel="noopener noreferrer"', 'class="ext-link"');
        }
        return `<a ${attrs.join(' ')}>${text}</a>`;
      },

      table(token) {
        // Wrapped so a wide reference table scrolls INSIDE its own box instead of
        // pushing the whole page into a horizontal scroll on a phone.
        const header = token.header
          .map((cell, i) => `<th${alignAttr(token.align[i])}>${this.parser.parseInline(cell.tokens)}</th>`)
          .join('');
        const rows = token.rows
          .map(
            (row) =>
              `<tr>${row
                .map((cell, i) => `<td${alignAttr(token.align[i])}>${this.parser.parseInline(cell.tokens)}</td>`)
                .join('')}</tr>`,
          )
          .join('\n');
        // tabindex makes the scroll container reachable by keyboard: a region that
        // scrolls but cannot be focused is unusable without a mouse (WCAG 2.1.1).
        return `<div class="table-scroll" tabindex="0" role="region" aria-label="Table"><table><thead><tr>${header}</tr></thead><tbody>\n${rows}\n</tbody></table></div>\n`;
      },
    },
  });

  return { marked, headings };
}

const alignAttr = (a) => (a ? ` style="text-align:${a}"` : '');

/** Reverse the escaping marked applies to inline text. Used only for values that
 *  are rendered as TEXT (the TOC, the search index, page summaries) — never for
 *  anything that goes back into HTML. */
function decodeEntities(s) {
  return String(s)
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
    // Ampersand LAST, or "&amp;lt;" would decode twice into "<".
    .replace(/&amp;/g, '&');
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Rewrite a link the way the SITE needs it, given that the markdown was authored
 * to be read inside a code repo:
 *
 *   ./OTHER-DOC.md          -> the site route for that doc, when it is published
 *                              here; otherwise a GitHub blob URL in the source repo
 *   #anchor                 -> left alone (same-page)
 *   /absolute/repo/path     -> GitHub blob URL
 *   https://…               -> untouched, flagged external
 */
function resolveLink(href, { routeFor, isSiteRoute, entry, warn }) {
  const raw = (href ?? '').trim();
  if (!raw) return { href: '#', external: false };
  if (raw.startsWith('#')) return { href: raw, external: false };
  if (/^[a-z][a-z0-9+.-]*:/i.test(raw)) {
    // The one absolute-URL rewrite this build performs, and the reason it does not
    // contradict "author links are left exactly as written" above.
    //
    // That rule rests on a promise: a github.com/hugmesh/<repo> link is a 404 only
    // because the repo is private, and it COMES GOOD the day it is opened. The
    // `hugmesh-net` org makes no such promise -- it is not a private account, it is
    // not an account at all (github.com/hugmesh-net => 404, github.com/hugmesh => 200),
    // so those links can never come good and there is no author intent to preserve
    // beyond "the HugMesh org". This site's own landing page was corrected for exactly
    // this bug; the vendored copies still carry it.
    //
    // Rewritten HERE rather than in sync-content, so `content/` stays a faithful
    // projection of the source and the defect keeps showing up in the warning below
    // instead of being silently laundered out of existence upstream.
    const fixed = raw.replace(/(https?:\/\/(?:www\.)?github\.com)\/hugmesh-net(?=$|[/#?])/gi, '$1/hugmesh');
    if (fixed !== raw) {
      warn(`dead org slug -> ${raw} (rewritten to ${fixed}; fix it upstream)`);
      return { href: fixed, external: true };
    }
    return { href: raw, external: !raw.startsWith('/') };
  }

  const [target, hash = ''] = raw.split('#');

  // A root-relative link to a path this SITE serves is a site route, checked before
  // anything repo-shaped. Without this, `/operations/resource-limits` in a page is
  // read as a repo-absolute file path, found not to be a .md, and rendered as
  // de-linked text — which is how every cross-reference in a site-authored page
  // silently stopped being a link.
  if (target.startsWith('/') && isSiteRoute(target)) {
    return { href: raw, external: false };
  }
  const suffix = hash ? `#${hash}` : '';

  // Resolve relative to the SOURCE file's directory inside its own repo, which
  // is the only frame the author was writing in.
  const fromDir = entry.path ? path.posix.dirname(entry.path) : '.';
  const repoPath = path.posix.normalize(
    target.startsWith('/') ? target.slice(1) : path.posix.join(fromDir, target),
  );

  if (/\.md$/i.test(repoPath)) {
    const route = routeFor(entry.repo, repoPath);
    if (route) return { href: `${route}${suffix}`, external: false };
  }

  if (!entry.repo) {
    // A site-authored page has no upstream repo to fall back to, so a link that did
    // not resolve above is simply broken. Loud, because nothing else will catch it.
    warn(`BROKEN LINK -> ${raw} (site-authored page; not a route this site serves)`);
    return { href: null, external: false, unpublished: raw };
  }
  if (!sourcesArePublic) {
    warn(`unpublished target -> ${entry.repo}/${repoPath} (rendered as plain text)`);
    return { href: null, external: false, unpublished: `${entry.repo}/${repoPath}` };
  }
  return {
    href: `${ORG_URL}/${entry.repo}/blob/main/${repoPath}${suffix}`,
    external: true,
  };
}

/** Allowlist for the rendered HTML. Everything here is either produced by our own
 *  renderer above or by marked's stock output; anything a document smuggles in
 *  (raw <script>, event handlers, javascript: URLs) is dropped. */
const SANITIZE = {
  allowedTags: [
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'p', 'div', 'span', 'br', 'hr', 'blockquote',
    'ul', 'ol', 'li', 'dl', 'dt', 'dd',
    'strong', 'em', 'del', 'ins', 'sub', 'sup', 'mark', 'abbr',
    'a', 'img', 'figure', 'figcaption',
    'code', 'pre', 'kbd', 'samp', 'var',
    'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'caption', 'colgroup', 'col',
    'details', 'summary',
  ],
  allowedAttributes: {
    a: ['href', 'title', 'target', 'rel', 'class', 'id', 'aria-label'],
    img: ['src', 'alt', 'title', 'width', 'height', 'loading'],
    pre: ['class', 'data-lang'],
    code: ['class'],
    div: ['class', 'tabindex', 'role', 'aria-label'],
    span: ['class', 'title'],
    th: ['style', 'colspan', 'rowspan', 'scope'],
    td: ['style', 'colspan', 'rowspan'],
    '*': ['id'],
  },
  allowedSchemes: ['http', 'https', 'mailto'],
  // Only the text-align our own table renderer emits — a style attribute is an
  // injection surface, so it is an exact-value allowlist, not a CSS parser.
  allowedStyles: { '*': { 'text-align': [/^left$|^right$|^center$/] } },
  transformTags: {
    img: (tagName, attribs) => ({
      tagName,
      attribs: { ...attribs, loading: 'lazy' },
    }),
  },
};

/** Flatten rendered HTML to searchable plain text. */
function textOf(html) {
  return decodeEntities(
    html
      .replace(/<pre[\s\S]*?<\/pre>/g, ' ')
      .replace(/<[^>]+>/g, ' '),
  )
    .replace(/\s+/g, ' ')
    .trim();
}

async function main() {
  const { docs, meta } = await loadManifest(ROOT);
  sourcesArePublic = meta.sourcesArePublic === true;

  // repo+path -> site route, so cross-document links between two PUBLISHED docs
  // become internal navigation instead of a trip to GitHub.
  const routeIndex = new Map(
    docs.filter((d) => d.repo && d.path).map((d) => [`${d.repo}:${d.path}`, d.route]),
  );
  const routeFor = (repo, p) => routeIndex.get(`${repo}:${p}`) ?? null;

  // Everything this site actually serves: every published document, every section
  // index, and the handful of standalone pages the router declares itself.
  const STANDALONE_ROUTES = ['/', '/search', '/downloads'];
  const siteRoutes = new Set([
    ...STANDALONE_ROUTES,
    ...SECTIONS.map((s) => `/${s.id}`),
    ...docs.map((d) => d.route),
  ]);
  const isSiteRoute = (p) => siteRoutes.has(p.replace(/\/$/, '') || '/');

  await rm(OUT, { recursive: true, force: true });
  await mkdir(OUT, { recursive: true });

  const warnings = [];
  const broken = [];
  // Kept apart from `warnings`: these links were REWRITTEN to a working URL, not
  // dropped to plain text. Counting them in the same bucket would both inflate the
  // unpublished figure and describe the opposite of what happened to them.
  const rewrites = [];
  const pages = [];
  const searchIndex = [];

  for (const entry of docs) {
    const file = path.join(ROOT, entry.contentPath);
    let raw;
    try {
      raw = await readFile(file, 'utf8');
    } catch {
      throw new Error(
        `${entry.section}/${entry.slug}: no content at ${entry.contentPath}. ` +
          (entry.authored
            ? 'This page is authored:"site" — write the file.'
            : 'Run: npm run refresh:content'),
      );
    }

    const { data, body } = parseFrontMatter(raw);
    const warn = (msg) => {
      const line = `${entry.section}/${entry.slug}: ${msg}`;
      const bucket = msg.startsWith('BROKEN LINK')
        ? broken
        : msg.startsWith('dead org slug')
          ? rewrites
          : warnings;
      bucket.push(line);
    };

    const { marked, headings } = createRenderer({ routeFor, isSiteRoute, entry, warn });
    const rendered = marked.parse(body);
    const html = sanitizeHtml(rendered, SANITIZE);

    // Table of contents from H2/H3 only: H1 is the page title (rendered by the
    // component, not by markdown) and H4+ makes the rail unusable on a phone.
    const toc = headings.map((h) => ({
      id: h.id,
      level: h.level,
      text: decodeEntities(sanitizeHtml(h.text, { allowedTags: [] })),
    }));

    const plain = textOf(html);
    const source = entry.repo
      ? {
          repo: entry.repo,
          path: entry.path,
          ref: data.source_ref ?? null,
          // null while the code repos are private — the page then names its
          // source without offering a link nobody can follow.
          url: sourcesArePublic ? `${ORG_URL}/${entry.repo}/blob/main/${entry.path}` : null,
        }
      : null;

    const page = {
      section: entry.section,
      slug: entry.slug,
      route: entry.route,
      title: entry.title,
      summary: entry.summary ?? data.summary ?? plain.slice(0, 180),
      hasMermaid: html.includes('class="mermaid"'),
      readingMinutes: Math.max(1, Math.round(plain.split(' ').length / 220)),
      toc,
      source,
      html,
    };

    const dest = path.join(OUT, entry.section, `${entry.slug}.json`);
    await mkdir(path.dirname(dest), { recursive: true });
    await writeFile(dest, JSON.stringify(page), 'utf8');

    pages.push(page);
    searchIndex.push({
      route: entry.route,
      section: entry.section,
      title: entry.title,
      summary: page.summary,
      headings: toc.map((t) => t.text),
      // Capped: the whole index is fetched on first search, and the long-tail of
      // a 2000-line doc contributes nothing a heading match does not already.
      text: plain.slice(0, 4000),
    });
  }

  const sections = groupBySection(docs).map((section) => ({
    id: section.id,
    title: section.title,
    blurb: section.blurb,
    docs: section.docs.map((d) => {
      const page = pages.find((p) => p.route === d.route);
      return {
        slug: d.slug,
        route: d.route,
        title: d.title,
        summary: page?.summary ?? '',
        readingMinutes: page?.readingMinutes ?? 1,
      };
    }),
  }));

  await writeFile(
    path.join(OUT, 'index.json'),
    JSON.stringify({
      generatedFrom: meta.description ?? 'docs.manifest.json',
      sectionOrder: SECTIONS.map((s) => s.id),
      sections,
      totals: { sections: sections.length, pages: pages.length },
    }),
    'utf8',
  );
  await writeFile(path.join(OUT, 'search.json'), JSON.stringify(searchIndex), 'utf8');

  const bytes = (await readdir(OUT, { recursive: true, withFileTypes: true })).filter((d) =>
    d.isFile(),
  ).length;

  if (rewrites.length) {
    const urls = new Set(rewrites.map((w) => w.split(' -> ')[1].split(' ')[0]));
    console.warn(
      `\n${rewrites.length} link(s) across ${urls.size} distinct URL(s) pointed at the ` +
        'github.com/hugmesh-net org, which does not exist. Rewritten to github.com/hugmesh ' +
        'for this build -- the typo is still upstream and should be fixed there.',
    );
    for (const u of [...urls].slice(0, 10)) console.warn(`  ${u}`);
    if (urls.size > 10) console.warn(`  … and ${urls.size - 10} more`);
  }

  if (warnings.length) {
    const unique = new Set(warnings.map((w) => w.split(' -> ')[1]));
    console.warn(
      `\n${warnings.length} cross-reference(s) to ${unique.size} unpublished document(s) ` +
        `rendered as plain text (sourcesArePublic=${sourcesArePublic}).`,
    );
    for (const w of [...unique].slice(0, 15)) console.warn(`  ${w}`);
    if (unique.size > 15) console.warn(`  … and ${unique.size - 15} more`);
  }
  console.log(
    `\nrendered ${pages.length} pages across ${sections.length} sections -> ${path.relative(ROOT, OUT)} (${bytes} files)`,
  );

  // FAIL, not warn. A site-authored page is written here, so a link that points at
  // nothing this site serves is a mistake this repository can and should fix now —
  // unlike a cross-reference into a private repo, which is a fact about the world.
  if (broken.length) {
    console.error(`\n${broken.length} broken link(s) in site-authored pages:`);
    for (const b of broken) console.error(`  ${b}`);
    throw new Error('site-authored pages must not link to routes that do not exist');
  }
}

main().catch((err) => {
  console.error(`\nbuild-content failed: ${err.message}`);
  process.exit(1);
});
