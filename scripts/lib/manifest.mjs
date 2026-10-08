/**
 * Loader + validator for docs.manifest.json — the site's PUBLICATION ALLOWLIST.
 *
 * Every hugmesh-* code repo is PRIVATE; this Pages repo is private too (decisions
 * 115a/115b); the SITE is what is public. So the
 * manifest is opt-in by construction: a document reaches the website because
 * somebody listed it here, never because a glob happened to match it. There is
 * no "publish everything under docs/" mode, and adding one would turn every
 * future internal note into an accidental disclosure.
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';

/** Sections are a CLOSED set: it is the site's top-level navigation, and the
 *  router has a hand-written route per section. A typo'd section in the manifest
 *  is a broken nav entry, so it fails the build instead. */
export const SECTIONS = [
  { id: 'overview', title: 'Overview', blurb: 'What HugMesh is and how the pieces fit together.' },
  { id: 'tutorials', title: 'Tutorials', blurb: 'Hands-on paths from zero to a running, branded, federated mesh.' },
  { id: 'architecture', title: 'Architecture', blurb: 'The platform as designed: tiers, boundaries, and the contracts between them.' },
  { id: 'operations', title: 'Operations', blurb: 'Running, upgrading and caring for a live mesh.' },
  { id: 'developer-guide', title: 'Developer Guide', blurb: 'Expanding the mesh: new services, GitOps with ArgoCD, and the deploy contract.' },
  { id: 'troubleshooting', title: 'Troubleshooting', blurb: 'Real failure signatures, their root causes, and the fixes.' },
  { id: 'studio', title: 'Studio', blurb: 'The desktop app that builds images and runs a mesh from your tray.' },
  { id: 'security', title: 'Security', blurb: 'The security model, hardening posture, and how to report an issue.' },
  { id: 'games', title: 'Games', blurb: 'The Godot game studio: authoring, multiplayer, and its own decision record.' },
  { id: 'devices', title: 'Devices & Images', blurb: 'Every hardware port and client image the generator can build.' },
  { id: 'reference', title: 'Reference', blurb: 'Catalogs, schemas, flags, and a page per service in the platform.' },
];

export const SECTION_IDS = new Set(SECTIONS.map((s) => s.id));

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * @typedef {object} DocEntry
 * @property {string} section   one of SECTION_IDS
 * @property {string} slug      URL segment, kebab-case
 * @property {string} title     nav + <h1> + <title>
 * @property {string} [summary] one-line description for cards and search
 * @property {number} [order]   sort key inside the section (default: manifest order)
 * @property {string} [repo]    origin repo, e.g. "hugmesh-generator" (omit for site-authored)
 * @property {string} [path]    path of the source file inside that repo
 * @property {string} [group]   optional nav grouping label INSIDE a section (no URL level)
 * @property {string} [authored] set to "site" for pages written here, with no upstream source
 */

/** Load, validate and normalise the manifest. Throws on the first structural
 *  problem with a message naming the offending entry — a half-valid manifest
 *  silently dropping pages is worse than a failed build. */
export async function loadManifest(root) {
  const file = path.join(root, 'docs.manifest.json');
  const parsed = JSON.parse(await readFile(file, 'utf8'));
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
    if (!entry.authored && !(entry.repo && entry.path)) {
      throw new Error(
        `${where}: needs either { repo, path } (vendored from a code repo) or authored:"site"`,
      );
    }

    const key = `${entry.section}/${entry.slug}`;
    if (seen.has(key)) {
      throw new Error(`${where}: duplicate route "${key}", already claimed by docs[${seen.get(key)}]`);
    }
    seen.set(key, i);

    return {
      ...entry,
      order: entry.order ?? i,
      /** Where the vendored copy lives in this repo. */
      contentPath: path.join('content', entry.section, `${entry.slug}.md`),
      route: `/${entry.section}/${entry.slug}`,
    };
  });

  return { meta: parsed.meta ?? {}, docs: normalised };
}

/** Group normalised entries by section, in SECTIONS order, each section's docs
 *  sorted by `order` then title. Entries carrying a `group` are kept together and
 *  precede the ungrouped ones, so a section like Reference reads as
 *  "services, then everything else" rather than as one 56-item list. */
export function groupBySection(docs) {
  return SECTIONS.map((section) => {
    const inSection = docs
      .filter((d) => d.section === section.id)
      .sort((a, b) => a.order - b.order || a.title.localeCompare(b.title));

    const groups = [...new Set(inSection.map((d) => d.group).filter(Boolean))];
    const ordered = [
      ...groups.flatMap((g) => inSection.filter((d) => d.group === g)),
      ...inSection.filter((d) => !d.group),
    ];
    return { ...section, docs: ordered };
  }).filter((s) => s.docs.length > 0);
}
