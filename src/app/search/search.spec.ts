import { SearchDoc } from '../content/content.models';
import { parseQuery, scoreDoc, excerptFor, search } from './search';

const doc = (over: Partial<SearchDoc>): SearchDoc => ({
  route: '/reference/example',
  section: 'reference',
  title: 'Example page',
  summary: 'A page about examples.',
  headings: [],
  text: '',
  ...over,
});

describe('search query parsing', () => {
  it('lowercases and splits on punctuation', () => {
    expect(parseQuery('ArgoCD, GitOps!').terms).toEqual(['argocd', 'gitops']);
  });

  it('keeps dotted and slashed tokens whole, because docs are full of paths', () => {
    expect(parseQuery('specs/cluster/apps hugmesh-generator').terms).toEqual([
      'specs/cluster/apps',
      'hugmesh-generator',
    ]);
  });

  it('drops one-character noise', () => {
    expect(parseQuery('a mesh').terms).toEqual(['mesh']);
  });

  it('extracts quoted phrases and removes them from the loose terms', () => {
    const q = parseQuery('"route access" gateway');
    expect(q.phrases).toEqual(['route access']);
    expect(q.terms).toEqual(['gateway']);
  });
});

describe('search scoring', () => {
  it('ranks a title match above a body-only match', () => {
    const titled = doc({ title: 'ArgoCD and GitOps', text: 'x' });
    const bodied = doc({ title: 'Something else', text: 'argocd argocd argocd argocd' });
    const q = parseQuery('argocd');
    expect(scoreDoc(titled, q)).toBeGreaterThan(scoreDoc(bodied, q));
  });

  it('ranks a heading match above a body-only match', () => {
    const headed = doc({ headings: ['Installing ArgoCD'], text: 'x' });
    const bodied = doc({ text: 'argocd' });
    const q = parseQuery('argocd');
    expect(scoreDoc(headed, q)).toBeGreaterThan(scoreDoc(bodied, q));
  });

  it('requires EVERY term to appear, so two words do not behave like an OR', () => {
    const partial = doc({ title: 'ArgoCD', text: 'gitops engine' });
    expect(scoreDoc(partial, parseQuery('argocd kubernetes'))).toBe(0);
  });

  it('requires a quoted phrase to appear as a phrase', () => {
    const scattered = doc({ text: 'the access rules for each route are listed' });
    expect(scoreDoc(scattered, parseQuery('"route access"'))).toBe(0);
    const exact = doc({ text: 'the route access table' });
    expect(scoreDoc(exact, parseQuery('"route access"'))).toBeGreaterThan(0);
  });

  it('caps the contribution of body repetition', () => {
    const few = doc({ text: Array(3).fill('mesh').join(' ') });
    const many = doc({ text: Array(300).fill('mesh').join(' ') });
    const q = parseQuery('mesh');
    // Both are capped at the same ceiling, so 100x the repetition is not 100x
    // the score — otherwise a glossary outranks the page named after the term.
    expect(scoreDoc(many, q)).toBeLessThan(scoreDoc(few, q) * 3);
  });

  it('prefers an exact title word over a title substring', () => {
    const exact = doc({ title: 'Local mesh', text: 'mesh' });
    const substring = doc({ title: 'Meshtastic bridge', text: 'mesh' });
    const q = parseQuery('mesh');
    expect(scoreDoc(exact, q)).toBeGreaterThan(scoreDoc(substring, q));
  });
});

describe('search excerpts', () => {
  it('centres on the first match and marks the elision', () => {
    const d = doc({ text: `${'filler '.repeat(40)}argocd syncs the apps${' more'.repeat(40)}` });
    const out = excerptFor(d, parseQuery('argocd'));
    expect(out).toContain('argocd syncs the apps');
    expect(out.startsWith('…')).toBeTrue();
  });

  it('falls back to the summary when the term is only in the title', () => {
    const d = doc({ title: 'ArgoCD', summary: 'The GitOps engine.', text: 'nothing relevant' });
    expect(excerptFor(d, parseQuery('argocd'))).toBe('The GitOps engine.');
  });
});

describe('search()', () => {
  const corpus = [
    doc({ route: '/a', title: 'ArgoCD and GitOps' }),
    doc({ route: '/b', title: 'Unrelated', text: 'argocd mentioned once' }),
    doc({ route: '/c', title: 'Nothing here', text: 'kubernetes' }),
  ];

  it('returns only matching documents, best first', () => {
    const hits = search(corpus, 'argocd');
    expect(hits.map((h) => h.doc.route)).toEqual(['/a', '/b']);
  });

  it('returns nothing for an empty or noise-only query', () => {
    expect(search(corpus, '')).toEqual([]);
    expect(search(corpus, '   ')).toEqual([]);
    expect(search(corpus, 'a')).toEqual([]);
  });

  it('honours the result limit', () => {
    const many = Array.from({ length: 50 }, (_, i) => doc({ route: `/r${i}`, title: 'mesh' }));
    expect(search(many, 'mesh', 10).length).toBe(10);
  });

  it('attaches an excerpt to every hit', () => {
    for (const hit of search(corpus, 'argocd')) {
      expect(hit.excerpt.length).toBeGreaterThan(0);
    }
  });
});
