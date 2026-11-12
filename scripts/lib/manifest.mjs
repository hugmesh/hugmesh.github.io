/**
 * Loader + validator for docs.manifest.json — the site's PUBLICATION ALLOWLIST.
 *
 * Every hugmesh-* code repo is PRIVATE; this Pages repo is private too (decisions
 * 115a/115b); the SITE is what is public. So the
 * manifest is opt-in by construction: a document reaches the website because
 * somebody listed it here, never because a glob happened to match it. There is
 * no "publish everything under docs/" mode, and adding one would turn every
 * future internal note into an accidental disclosure.
 *
 * Besides the page list, the manifest carries the site's NAVIGATION:
 *
 *   sections   per tab: an optional start page, an optional symptom index page and
 *              ordered groups of routes. The order of a group's `pages` array is
 *              the order readers see. Every page is listed in exactly one group,
 *              its "nav home", which may be a different tab from its URL prefix:
 *              a page can be filed where readers look for it without moving it.
 *   redirects  retired URLs and where each one went.
 */
import { readFile, access } from 'node:fs/promises';
import path from 'node:path';
import { basisDeclProblems } from './basis.mjs';

/** Sections are a CLOSED set: it is the site's top-level navigation, and the
 *  router has a hand-written route per section. A typo'd section in the manifest
 *  is a broken nav entry, so it fails the build instead. The ids are URL
 *  namespaces and never change; the order is the header order, and `cluster`
 *  is the header group each tab sits in. Mirrored by src/app/content/sections.ts. */
export const SECTIONS = [
  { id: 'overview', cluster: 'learn', title: 'Overview', blurb: 'What HugMesh is, who it is for, and how the pieces fit together.' },
  { id: 'tutorials', cluster: 'learn', title: 'Get started', blurb: 'From downloading the Studio to a running mesh, one step at a time.' },
  { id: 'studio', cluster: 'use', title: 'Studio', blurb: 'The desktop app that builds your images and runs a local mesh.' },
  { id: 'operations', cluster: 'use', title: 'Run a mesh', blurb: 'Sign-in, going public, services, keys and backups for a running mesh.' },
  { id: 'troubleshooting', cluster: 'use', title: 'Troubleshooting', blurb: 'Look up the error you see, then its cause and the fix.' },
  { id: 'devices', cluster: 'reference', title: 'Devices and images', blurb: 'The hardware HugMesh runs on and the images you can build for it.' },
  { id: 'security', cluster: 'reference', title: 'Security', blurb: 'How accounts, data and keys are protected, and how to report a problem.' },
  { id: 'architecture', cluster: 'reference', title: 'Architecture', blurb: 'How the cluster, the gateways and the web front end are built.' },
  { id: 'reference', cluster: 'reference', title: 'Reference', blurb: 'A page for each service, the build matrix, and third-party licences.' },
  { id: 'games', cluster: 'build', title: 'Games', blurb: 'The Game Studio: guides for each role, how-tos, architecture and decisions.' },
  { id: 'developer-guide', cluster: 'build', title: 'Developer guide', blurb: 'Add a service, use the shared libraries, and run the tests.' },
];

export const SECTION_IDS = new Set(SECTIONS.map((s) => s.id));

/** Routes the app serves that are not documents or section indexes. A group may
 *  list them (Get started lists /downloads as its first step). */
export const STANDALONE_ROUTES = ['/', '/search', '/downloads'];

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const GROUP_ID_RE = SLUG_RE;

/** Upper-case words a title may contain. Anything else of four or more capitals
 *  is shouting copied from a repo heading (RUNNING, ENTIRE, DARK, FINDINGS). */
export const TITLE_ACRONYMS = new Set([
  'KEYS', 'QEMU', 'WASM', 'WCAG', 'OIDC', 'TURN', 'STUN', 'JDBC', 'R2DBC', 'NVIDIA', 'OWASP', 'LUKS',
]);

/**
 * Why a title is not a short name a reader can scan, or [] when it is one.
 * `groupId` is the id of the group that lists the page: only a page in a group
 * called "decisions" may start with a number ("012: ..."), which is how numbered
 * decision records keep their order visible.
 */
export function lintTitle(title, groupId = '') {
  const problems = [];
  const t = String(title ?? '');
  if (/\{\{|\}\}/.test(t)) problems.push('a template placeholder ({{ }})');
  if (t.includes('/')) problems.push('a slash (write "A and B")');
  if (/ — | – | - |—|–/.test(t)) problems.push('a dash (a title is one short name)');
  if (/\bhugmesh-[a-z0-9-]+/i.test(t)) problems.push('a repository name (put it in the summary)');
  if (/hugmesh\.net/i.test(t)) problems.push('the domain name');
  if (/^[a-z0-9-]+$/.test(t)) problems.push('a slug, not a name');
  if (/#\d+|\bFD-\d+\b|\(v\d+\)|\bP\d\b|\b(issue|PR)\b/.test(t)) problems.push('a ticket or version id');
  for (const word of t.match(/\b[A-Z][A-Z0-9]{3,}\b/g) ?? []) {
    if (!TITLE_ACRONYMS.has(word)) problems.push(`the capitalised word "${word}"`);
  }
  if (/^\d/.test(t)) {
    if (!/^\d{3}: \S/.test(t)) problems.push('a leading number (only "NNN: Title" in decisions)');
    else if (groupId !== 'decisions') problems.push('a decision number outside a "decisions" group');
  }
  if (t.length < 3 || t.length > 60) problems.push(`length ${t.length} (3 to 60 characters)`);
  return problems;
}

/** Why a summary does not work as the one-line description under a title. */
export function lintSummary(summary, title) {
  const problems = [];
  const s = String(summary ?? '').trim();
  if (!s) problems.push('no summary');
  if (s.length > 160) problems.push(`length ${s.length} (at most 160 characters)`);
  if (/\{\{|\}\}/.test(s)) problems.push('a template placeholder ({{ }})');
  if (s && s.toLowerCase() === String(title ?? '').trim().toLowerCase()) problems.push('the same text as the title');
  return problems;
}

/**
 * @typedef {object} DocEntry
 * @property {string} section   one of SECTION_IDS: the URL namespace
 * @property {string} slug      URL segment, kebab-case
 * @property {string} title     nav + <h1> + <title>; must pass lintTitle
 * @property {string} summary   one line under the title in lists and search
 * @property {string} [repo]    origin repo, e.g. "hugmesh-generator" (omit for site-authored)
 * @property {string} [path]    path of the source file inside that repo
 * @property {string} [authored] set to "site" for pages written here, with no upstream source
 * @property {{repo: string, path: string}[]} [basis] required on a site-written page: the
 *           upstream files its facts come from ([] when there is none). See lib/basis.mjs.
 */

const exists = (p) => access(p).then(() => true, () => false);

/** Load, validate and normalise the manifest. Throws on the first structural
 *  problem with a message naming the offending entry — a half-valid manifest
 *  silently dropping pages is worse than a failed build. */
export async function loadManifest(root) {
  const file = path.join(root, 'docs.manifest.json');
  const parsed = JSON.parse(await readFile(file, 'utf8'));
  const result = validateManifest(parsed);
  // Every tab has an intro, written here (it is not vendored), so the file must exist.
  for (const s of SECTIONS) {
    const landing = path.join(root, 'landings', `${s.id}.md`);
    if (!(await exists(landing))) {
      throw new Error(`sections.${s.id}: no intro at landings/${s.id}.md`);
    }
  }
  return result;
}

/** The checks behind loadManifest that need no file system, exported so
 *  scripts/manifest.test.mjs can drive one failing fixture per rule. */
export function validateManifest(parsed) {
  const entries = parsed.docs;

  if (!Array.isArray(entries)) {
    throw new Error(`docs.manifest.json: expected a top-level "docs" array`);
  }

  const seen = new Map();
  const normalised = entries.map((entry, i) => {
    const where = `docs[${i}] (${entry.section ?? '?'}/${entry.slug ?? '?'})`;

    if (!SECTION_IDS.has(entry.section)) {
      throw new Error(
        `${where}: unknown section "${entry.section}". Known sections: ${[...SECTION_IDS].join(', ')}`,
      );
    }
    if (!SLUG_RE.test(entry.slug ?? '')) {
      throw new Error(`${where}: slug must be kebab-case, got "${entry.slug}"`);
    }
    if (!entry.title) {
      throw new Error(`${where}: title is required`);
    }
    if ('order' in entry || 'group' in entry) {
      throw new Error(
        `${where}: "order" and "group" are gone; list the page in a group under "sections" instead, ` +
          'where the order of the pages array is the order readers see',
      );
    }
    if (!entry.authored && !(entry.repo && entry.path)) {
      throw new Error(
        `${where}: needs either { repo, path } (vendored from a code repo) or authored:"site"`,
      );
    }

    const basisProblems = basisDeclProblems(entry);
    if (basisProblems.length) {
      throw new Error(`${where}: ${basisProblems.join('; ')}`);
    }

    const key = `${entry.section}/${entry.slug}`;
    if (seen.has(key)) {
      throw new Error(`${where}: duplicate route "${key}", already claimed by docs[${seen.get(key)}]`);
    }
    seen.set(key, i);

    return {
      ...entry,
      /** Where the vendored copy lives in this repo. */
      contentPath: path.join('content', entry.section, `${entry.slug}.md`),
      route: `/${entry.section}/${entry.slug}`,
    };
  });

  const docRoutes = new Set(normalised.map((d) => d.route));
  const sectionRoutes = new Set(SECTIONS.map((s) => `/${s.id}`));
  const isLive = (route) =>
    docRoutes.has(route) || sectionRoutes.has(route) || STANDALONE_ROUTES.includes(route);

  // ── navigation ────────────────────────────────────────────────────────────
  const nav = parsed.sections;
  if (!nav || typeof nav !== 'object' || Array.isArray(nav)) {
    throw new Error('docs.manifest.json: expected a top-level "sections" object (one entry per tab)');
  }
  for (const id of Object.keys(nav)) {
    if (!SECTION_IDS.has(id)) throw new Error(`sections.${id}: not a known section`);
  }
  /** route -> { section, group } for every listed route */
  const listedAt = new Map();
  const sections = SECTIONS.map((meta) => {
    const s = nav[meta.id];
    const where = `sections.${meta.id}`;
    if (!s) throw new Error(`${where}: missing; every tab needs at least one group`);
    if (!Array.isArray(s.groups) || s.groups.length === 0) {
      throw new Error(`${where}: needs at least one group`);
    }
    for (const field of ['start', 'index']) {
      const r = s[field];
      if (r === undefined || r === null) continue;
      const [p] = String(r).split('#');
      if (!isLive(p)) throw new Error(`${where}.${field}: "${r}" is not a page this site serves`);
    }
    const groupIds = new Set();
    const groups = s.groups.map((g, gi) => {
      const gw = `${where}.groups[${gi}] (${g.id ?? '?'})`;
      if (!GROUP_ID_RE.test(g.id ?? '')) throw new Error(`${gw}: id must be kebab-case`);
      if (groupIds.has(g.id)) throw new Error(`${gw}: duplicate group id "${g.id}" in ${meta.id}`);
      groupIds.add(g.id);
      if (!g.title) throw new Error(`${gw}: title is required`);
      if (!Array.isArray(g.pages) || g.pages.length === 0) throw new Error(`${gw}: needs at least one page`);
      for (const r of g.pages) {
        const [p] = String(r).split('#');
        if (!isLive(p)) throw new Error(`${gw}: "${r}" is not a page this site serves`);
        if (listedAt.has(r)) {
          const prev = listedAt.get(r);
          throw new Error(`${gw}: "${r}" is already listed in ${prev.section}/${prev.group}; list each page once`);
        }
        listedAt.set(r, { section: meta.id, group: g.id });
      }
      return { id: g.id, title: g.title, blurb: g.blurb ?? null, pages: [...g.pages] };
    });
    return { ...meta, start: s.start ?? null, index: s.index ?? null, groups };
  });

  for (const d of normalised) {
    const at = listedAt.get(d.route);
    if (!at) {
      throw new Error(`${d.route}: not listed in any group under "sections"; every page needs a nav home`);
    }
    d.navSection = at.section;
    d.navGroup = at.group;
  }

  // ── titles and summaries ──────────────────────────────────────────────────
  const titles = new Map();
  for (const d of normalised) {
    const problems = lintTitle(d.title, d.navGroup);
    if (problems.length) {
      throw new Error(`${d.route}: title "${d.title}" has ${problems.join(', ')}`);
    }
    const key = d.title.toLowerCase();
    if (titles.has(key)) throw new Error(`${d.route}: title "${d.title}" is already used by ${titles.get(key)}`);
    titles.set(key, d.route);
    const sp = lintSummary(d.summary, d.title);
    if (sp.length) throw new Error(`${d.route}: summary has ${sp.join(', ')}`);
  }
  // Decision numbers are unique inside their group, or two records claim one number.
  for (const s of sections) {
    for (const g of s.groups.filter((x) => x.id === 'decisions')) {
      const nums = new Map();
      for (const r of g.pages) {
        const d = normalised.find((x) => x.route === r);
        const m = d && /^(\d{3}): /.exec(d.title);
        if (!m) continue;
        if (nums.has(m[1])) throw new Error(`${r}: decision number ${m[1]} is also used by ${nums.get(m[1])}`);
        nums.set(m[1], r);
      }
    }
  }

  // ── redirects ─────────────────────────────────────────────────────────────
  const redirects = parsed.redirects ?? [];
  if (!Array.isArray(redirects)) throw new Error('docs.manifest.json: "redirects" must be an array');
  const froms = new Map();
  for (const [i, r] of redirects.entries()) {
    const where = `redirects[${i}] (${r.from ?? '?'})`;
    const m = /^\/([a-z0-9-]+)\/([a-z0-9]+(?:-[a-z0-9]+)*)$/.exec(r.from ?? '');
    if (!m || !SECTION_IDS.has(m[1])) {
      throw new Error(`${where}: "from" must be /<known section>/<slug>`);
    }
    if (isLive(r.from)) throw new Error(`${where}: "${r.from}" is a live page; a redirect would hide it`);
    if (froms.has(r.from)) throw new Error(`${where}: "${r.from}" is redirected twice`);
    froms.set(r.from, r.to);
    const [to] = String(r.to ?? '').split('#');
    if (!isLive(to)) throw new Error(`${where}: target "${r.to}" is not a page this site serves`);
  }
  for (const [from, to] of froms) {
    const [p] = to.split('#');
    if (froms.has(p)) throw new Error(`redirect ${from} -> ${to} chains into another redirect`);
  }

  return {
    meta: parsed.meta ?? {},
    docs: normalised,
    sections,
    redirects: [...froms].map(([from, to]) => ({ from, to })),
  };
}

/**
 * Links INTO pages: every '#fragment' a start link, a group or a redirect names
 * must be a heading the target page really has, or the reader lands at the top of
 * the page wondering where the promised section went. `tocByRoute` maps a route to
 * the set of heading ids its rendered page has. Returns one message per problem.
 */
export function fragmentProblems(manifest, tocByRoute) {
  const problems = [];
  const check = (where, ref) => {
    const [route, frag] = String(ref).split('#');
    if (frag === undefined) return;
    const ids = tocByRoute.get(route);
    if (!ids || !ids.has(frag)) problems.push(`${where}: BROKEN LINK -> ${ref} (no heading "${frag}" on ${route})`);
  };
  for (const s of manifest.sections) {
    if (s.start) check(`sections.${s.id}.start`, s.start);
    for (const g of s.groups) for (const r of g.pages) check(`sections.${s.id}.${g.id}`, r);
  }
  for (const r of manifest.redirects) check(`redirect ${r.from}`, r.to);
  return problems;
}

/** Every doc in nav order: tab by tab in header order, group by group. */
export function navOrder(manifest) {
  const byRoute = new Map(manifest.docs.map((d) => [d.route, d]));
  return manifest.sections.flatMap((s) => s.groups.flatMap((g) => g.pages.map((r) => byRoute.get(r)).filter(Boolean)));
}

/** Group normalised entries by URL section, in SECTIONS order. A section's docs
 *  are every doc whose URL starts /<id>/, in nav order, so a page's JSON is
 *  always found under its own URL section whichever tab lists it. */
export function groupBySection(manifest) {
  const ordered = navOrder(manifest);
  return SECTIONS.map((section) => ({
    ...section,
    docs: ordered.filter((d) => d.section === section.id),
  })).filter((s) => s.docs.length > 0);
}
