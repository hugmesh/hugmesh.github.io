/**
 * The site's closed section list.
 *
 * This mirrors SECTIONS in scripts/lib/manifest.mjs. It is duplicated rather than
 * imported because the build script is plain ESM run by Node before the Angular
 * build, and the app must not depend on build-time code at runtime. The
 * duplication is not left to trust: content/sections.spec.ts fails if this list
 * and the generated assets/content/index.json disagree.
 */
export interface SectionMeta {
  readonly id: string;
  readonly title: string;
  /** Short label for the top nav, where the full title is too long. */
  readonly navLabel: string;
  readonly blurb: string;
  /** Inline SVG path data for the section icon (24x24 viewBox). */
  readonly icon: string;
}

export const SECTIONS: readonly SectionMeta[] = [
  {
    id: 'overview',
    title: 'Overview',
    navLabel: 'Overview',
    blurb: 'What HugMesh is and how the pieces fit together.',
    icon: 'M12 2 2 7l10 5 10-5-10-5Zm0 7.5L4.2 6 12 2.2 19.8 6 12 9.5ZM2 12l10 5 10-5v2.2l-10 5-10-5V12Z',
  },
  {
    id: 'tutorials',
    title: 'Tutorials',
    navLabel: 'Tutorials',
    blurb: 'Hands-on paths from zero to a running, branded, federated mesh.',
    icon: 'M12 3 1 8l11 5 9-4.09V17h2V8L12 3ZM5 13.18v4L12 21l7-3.82v-4L12 17l-7-3.82Z',
  },
  {
    id: 'architecture',
    title: 'Architecture',
    navLabel: 'Architecture',
    blurb: 'The platform as designed: tiers, boundaries, and the contracts between them.',
    icon: 'M3 3h8v6H3V3Zm10 0h8v6h-8V3ZM3 11h8v10H3V11Zm10 0h8v4h-8v-4Zm0 6h8v4h-8v-4Z',
  },
  {
    id: 'operations',
    title: 'Operations',
    navLabel: 'Operations',
    blurb: 'Running, upgrading and caring for a live mesh.',
    icon: 'M19.4 13a7.6 7.6 0 0 0 0-2l2-1.6-2-3.4-2.4 1a7.6 7.6 0 0 0-1.7-1L15 3H11l-.3 2.6a7.6 7.6 0 0 0-1.7 1l-2.4-1-2 3.4L6.6 11a7.6 7.6 0 0 0 0 2l-2 1.6 2 3.4 2.4-1c.5.4 1.1.8 1.7 1L11 21h4l.3-2.6c.6-.2 1.2-.6 1.7-1l2.4 1 2-3.4-2-1.6ZM13 15.5a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7Z',
  },
  {
    id: 'developer-guide',
    title: 'Developer Guide',
    navLabel: 'Developers',
    blurb: 'Expanding the mesh: new services, GitOps with ArgoCD, and the deploy contract.',
    icon: 'M9.4 16.6 4.8 12l4.6-4.6L8 6l-6 6 6 6 1.4-1.4Zm5.2 0 4.6-4.6-4.6-4.6L16 6l6 6-6 6-1.4-1.4Z',
  },
  {
    id: 'troubleshooting',
    title: 'Troubleshooting',
    navLabel: 'Troubleshooting',
    blurb: 'Real failure signatures, their root causes, and the fixes.',
    icon: 'M11 15h2v2h-2v-2Zm0-8h2v6h-2V7Zm1-5C6.5 2 2 6.5 2 12s4.5 10 10 10 10-4.5 10-10S17.5 2 12 2Zm0 18a8 8 0 1 1 0-16 8 8 0 0 1 0 16Z',
  },
  {
    id: 'studio',
    title: 'Studio',
    navLabel: 'Studio',
    blurb: 'The desktop app that builds images and runs a mesh from your tray.',
    icon: 'M21 2H3a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h7v2H7v2h10v-2h-3v-2h7a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2Zm0 14H3V4h18v12Z',
  },
  {
    id: 'security',
    title: 'Security',
    navLabel: 'Security',
    blurb: 'The security model, hardening posture, and how to report an issue.',
    icon: 'M12 1 3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4Zm0 10.99h7c-.53 4.12-3.28 7.79-7 8.94V12H5V6.3l7-3.11v8.8Z',
  },
  {
    id: 'games',
    title: 'Games',
    navLabel: 'Games',
    blurb: 'The Godot game studio: authoring, multiplayer, and its own decision record.',
    icon: 'M21 6H3a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h18a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2ZM11 13H8v3H6v-3H3v-2h3V8h2v3h3v2Zm4.5 2a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3Zm4-3a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3Z',
  },
  {
    id: 'devices',
    title: 'Devices & Images',
    navLabel: 'Devices',
    blurb: 'Every hardware port and client image the generator can build.',
    icon: 'M4 6h16v10H4V6Zm0-2a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h6v2H7v2h10v-2h-3v-2h6a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2H4Z',
  },
  {
    id: 'reference',
    title: 'Reference',
    navLabel: 'Reference',
    blurb: 'Catalogs, schemas, flags, and a page per service in the platform.',
    icon: 'M4 3h13a3 3 0 0 1 3 3v15H7a3 3 0 0 1-3-3V3Zm2 2v13a1 1 0 0 0 1 1h11V6a1 1 0 0 0-1-1H6Zm2 3h9v2H8V8Zm0 4h9v2H8v-2Z',
  },
];

export const SECTION_IDS: readonly string[] = SECTIONS.map((s) => s.id);

export function sectionMeta(id: string): SectionMeta | undefined {
  return SECTIONS.find((s) => s.id === id);
}
