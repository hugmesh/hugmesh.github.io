/**
 * One real HTML file per app route, plus robots.txt and sitemap.xml.
 *
 * WHY. GitHub Pages has no rewrite rules. Before this, every URL except `/` had
 * no file behind it, so Pages answered with 404.html and a 404 STATUS: the app
 * still booted (404.html is a copy of index.html), so a person saw the page, but
 * every crawler, link checker and preview card saw "not found", and search
 * engines dropped the whole site except its front page.
 *
 * WHAT. For every route the app serves (the standalone pages, each section index
 * and each published document), a copy of index.html with that page's own
 * <title>, description, canonical URL and Open Graph tags, written twice:
 *
 *   <route>/index.html   what `/route/` serves (Pages always answers a trailing
 *                        slash from the directory's index.html, status 200);
 *   <route>.html         what `/route` serves: Pages answers an extensionless
 *                        path from `<path>.html` with a 200, and without this
 *                        file it would 301 to `/route/` first.
 *
 * The app still boots from either and routes itself, exactly as before; the
 * difference is the status code and the head tags a non-browser reads.
 * Canonical and sitemap URLs use the trailing-slash form because that one is
 * answered 200 directly whatever Pages' precedence between the two files is.
 * 404.html stays a byte-copy of index.html (the Pages workflow asserts it), so
 * an unknown path still gets the app's own not-found page with a 404 status.
 *
 * Pure functions, so scripts/static-pages.test.mjs can test them without a build.
 */

/** Every route the app serves, from the generated content index. */
export function routesFromIndex(index, { siteName = 'HugMesh Documentation' } = {}) {
  const routes = [
    {
      route: '/downloads',
      title: `Download HugMesh Studio — ${siteName}`,
      description:
        'Download HugMesh Studio for Windows or Linux, with checksums and verification steps, plus every container image and Maven package the HugMesh repositories publish.',
    },
    {
      route: '/search',
      title: `Search — ${siteName}`,
      description: 'Search the HugMesh documentation.',
    },
  ];
  for (const section of index.sections ?? []) {
    routes.push({
      route: `/${section.id}`,
      title: `${section.title} — ${siteName}`,
      description: section.blurb || `${section.title} in the HugMesh documentation.`,
    });
    for (const doc of section.docs ?? []) {
      routes.push({
        route: doc.route,
        title: `${doc.title} — ${siteName}`,
        description: doc.summary || doc.title,
      });
    }
  }
  const seen = new Set();
  for (const r of routes) {
    if (!/^\/[a-z0-9][a-z0-9/_-]*$/i.test(r.route) || r.route.endsWith('/') || r.route.includes('..')) {
      throw new Error(`refusing to write a page for the route ${JSON.stringify(r.route)}`);
    }
    if (seen.has(r.route)) throw new Error(`route ${r.route} is listed twice`);
    seen.add(r.route);
  }
  return routes;
}

const escapeAttr = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const escapeText = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** The URL a route is canonically served at: the trailing-slash form (see above). */
export function canonicalUrl(origin, route) {
  return route === '/' ? `${origin}/` : `${origin}${route}/`;
}

/**
 * index.html with one page's head tags. Each replacement must hit exactly once:
 * if index.html changes shape, this fails the build instead of quietly writing
 * 300 pages that all claim to be the home page.
 */
export function pageHtml(indexHtml, { route, title, description }, origin) {
  const url = canonicalUrl(origin, route);
  // Tolerant of both spellings: the source file writes `content="…" />` and
  // the Angular build re-serialises it as `content="…"/>` on one line.
  const tag = (name, attr) => new RegExp(`<${name}\\s+${attr}\\s+(content|href)="[^"]*"\\s*\\/?>`);
  const swaps = [
    [/<title>[^<]*<\/title>/, `<title>${escapeText(title)}</title>`],
    [tag('meta', 'name="description"'), `<meta name="description" content="${escapeAttr(description)}" />`],
    [tag('meta', 'property="og:title"'), `<meta property="og:title" content="${escapeAttr(title)}" />`],
    [tag('meta', 'property="og:description"'), `<meta property="og:description" content="${escapeAttr(description)}" />`],
    [tag('meta', 'property="og:url"'), `<meta property="og:url" content="${escapeAttr(url)}" />`],
    [tag('link', 'rel="canonical"'), `<link rel="canonical" href="${escapeAttr(url)}" />`],
  ];
  let html = indexHtml;
  for (const [re, replacement] of swaps) {
    const hits = html.match(new RegExp(re.source, 'g'))?.length ?? 0;
    if (hits !== 1) throw new Error(`index.html: expected exactly one match for ${re}, found ${hits}`);
    html = html.replace(re, () => replacement);
  }
  return html;
}

/** Files to write for one route, relative to the output directory. */
export function filesForRoute(route) {
  const rel = route.slice(1);
  return [`${rel}/index.html`, `${rel}.html`];
}

export function sitemapXml(origin, routes, lastmod) {
  const urls = ['/', ...routes.map((r) => r.route)].map(
    (route) => `  <url><loc>${escapeText(canonicalUrl(origin, route))}</loc><lastmod>${lastmod}</lastmod></url>`,
  );
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`;
}

export function robotsTxt(origin) {
  return `User-agent: *\nAllow: /\n\nSitemap: ${origin}/sitemap.xml\n`;
}
