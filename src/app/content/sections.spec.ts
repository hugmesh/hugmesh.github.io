import { SECTIONS, SECTION_IDS, sectionMeta } from './sections';
import contentIndex from '../../assets/content/index.json';

/**
 * sections.ts duplicates the section list that scripts/lib/manifest.mjs owns.
 * The duplication is deliberate — the build script is Node-side ESM and the app
 * must not import build-time code — but it is NOT left to trust: this spec fails
 * the moment the two drift, which is the failure that would otherwise ship a
 * published section with no way to navigate to it.
 */
describe('section metadata', () => {
  const generated = contentIndex as {
    sectionOrder: string[];
    sections: { id: string; title: string; blurb: string }[];
  };

  it('covers every section the content build emitted', () => {
    const missing = generated.sections.map((s) => s.id).filter((id) => !SECTION_IDS.includes(id));
    expect(missing)
      .withContext('published sections with no entry in sections.ts are unreachable from the nav')
      .toEqual([]);
  });

  it('declares sections in the same order the content build used', () => {
    const shared = generated.sectionOrder.filter((id) => SECTION_IDS.includes(id));
    const mine = SECTION_IDS.filter((id) => generated.sectionOrder.includes(id));
    expect(mine).toEqual(shared);
  });

  it('agrees with the generated index on every section title and blurb', () => {
    for (const s of generated.sections) {
      const meta = sectionMeta(s.id);
      expect(meta).withContext(`no metadata for section ${s.id}`).toBeDefined();
      expect(meta!.title).withContext(`title for ${s.id}`).toBe(s.title);
      expect(meta!.blurb).withContext(`blurb for ${s.id}`).toBe(s.blurb);
    }
  });

  it('gives every section a non-empty nav label, blurb and icon', () => {
    for (const s of SECTIONS) {
      expect(s.navLabel.length).withContext(`${s.id} navLabel`).toBeGreaterThan(0);
      expect(s.blurb.length).withContext(`${s.id} blurb`).toBeGreaterThan(10);
      // Icons are raw SVG path data rendered into [attr.d]; anything that is not
      // a path command would draw nothing and fail silently.
      expect(s.icon).withContext(`${s.id} icon`).toMatch(/^[Mm]/);
    }
  });

  it('uses kebab-case ids, because they are URL segments', () => {
    for (const id of SECTION_IDS) {
      expect(id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
    }
  });

  it('has no duplicate ids', () => {
    expect(new Set(SECTION_IDS).size).toBe(SECTION_IDS.length);
  });

  it('returns undefined for an unknown section rather than throwing', () => {
    expect(sectionMeta('not-a-section')).toBeUndefined();
  });
});
