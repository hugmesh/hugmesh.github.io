import { SearchDoc } from '../content/content.models';

export interface SearchHit {
  readonly doc: SearchDoc;
  readonly score: number;
  /** A short excerpt around the first body match, for the result list. */
  readonly excerpt: string;
}

/** Split a query into lowercase terms, dropping punctuation and one-character
 *  noise. Quoted phrases are kept intact so `"route access"` behaves. */
export function parseQuery(raw: string): { terms: string[]; phrases: string[] } {
  const phrases: string[] = [];
  const rest = raw.replace(/"([^"]+)"/g, (_, phrase: string) => {
    const p = phrase.trim().toLowerCase();
    if (p) phrases.push(p);
    return ' ';
  });
  const terms = rest
    .toLowerCase()
    .split(/[^a-z0-9._/-]+/)
    .filter((t) => t.length > 1);
  return { terms, phrases };
}

/**
 * Score one document against a query.
 *
 * The weights encode what a reader looking through documentation actually wants:
 * a title match is a near-certain hit, a heading match means the page has a
 * SECTION about the thing, and a body match only means the words appear
 * somewhere. Body matches are also capped, so a page that happens to repeat a
 * common word forty times cannot outrank the page actually named after it.
 */
const WEIGHT = { title: 12, heading: 4, summary: 3, body: 1, phrase: 8 };
const BODY_CAP = 6;

export function scoreDoc(doc: SearchDoc, query: ReturnType<typeof parseQuery>): number {
  const title = doc.title.toLowerCase();
  const summary = doc.summary.toLowerCase();
  const headings = doc.headings.map((h) => h.toLowerCase());
  const body = doc.text.toLowerCase();

  let score = 0;

  for (const phrase of query.phrases) {
    if (title.includes(phrase)) score += WEIGHT.phrase * 2;
    if (headings.some((h) => h.includes(phrase))) score += WEIGHT.phrase;
    if (body.includes(phrase)) score += WEIGHT.phrase / 2;
  }

  for (const term of query.terms) {
    if (title.includes(term)) score += WEIGHT.title;
    // An exact title word beats a substring: searching "mesh" should put
    // "Local mesh" above "Meshtastic bridge".
    if (title.split(/\W+/).includes(term)) score += WEIGHT.title / 2;
    if (summary.includes(term)) score += WEIGHT.summary;
    score += Math.min(headings.filter((h) => h.includes(term)).length, 3) * WEIGHT.heading;
    score += Math.min(countOccurrences(body, term), BODY_CAP) * WEIGHT.body;
  }

  // Every term must appear SOMEWHERE, or a two-word query degenerates into an
  // OR and returns half the site.
  const haystack = `${title} ${summary} ${headings.join(' ')} ${body}`;
  const missing = query.terms.some((t) => !haystack.includes(t));
  const missingPhrase = query.phrases.some((p) => !haystack.includes(p));
  if (missing || missingPhrase) return 0;

  return score;
}

function countOccurrences(haystack: string, needle: string): number {
  let count = 0;
  let i = haystack.indexOf(needle);
  while (i !== -1) {
    count += 1;
    i = haystack.indexOf(needle, i + needle.length);
  }
  return count;
}

/** Pull ~180 characters of context around the first match, on word boundaries. */
export function excerptFor(doc: SearchDoc, query: ReturnType<typeof parseQuery>): string {
  const needle = query.phrases[0] ?? query.terms[0];
  if (!needle) return doc.summary;

  const at = doc.text.toLowerCase().indexOf(needle);
  if (at === -1) return doc.summary;

  const start = Math.max(0, at - 70);
  const end = Math.min(doc.text.length, at + needle.length + 110);
  const slice = doc.text.slice(start, end);
  return `${start > 0 ? '…' : ''}${slice.trim()}${end < doc.text.length ? '…' : ''}`;
}

export function search(docs: readonly SearchDoc[], raw: string, limit = 40): SearchHit[] {
  const query = parseQuery(raw);
  if (query.terms.length === 0 && query.phrases.length === 0) return [];

  return docs
    .map((doc) => ({ doc, score: scoreDoc(doc, query), excerpt: '' }))
    .filter((hit) => hit.score > 0)
    .sort((a, b) => b.score - a.score || a.doc.title.localeCompare(b.doc.title))
    .slice(0, limit)
    .map((hit) => ({ ...hit, excerpt: excerptFor(hit.doc, query) }));
}
