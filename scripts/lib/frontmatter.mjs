/**
 * Minimal front-matter reader/writer.
 *
 * Deliberately NOT a YAML library: every front-matter block in `content/` is
 * MACHINE-WRITTEN by scripts/sync-content.mjs from docs.manifest.json, so the
 * value space is exactly "flat string keys". Pulling in a YAML parser would let
 * hand-edited content express structures the renderer has no contract for, and
 * the whole point of the vendored-content model is that `content/` is a
 * reproducible projection of the manifest, not a second place to author.
 */

const FENCE = '---';

/** Split a raw file into { data, body }. A file with no front matter yields an
 *  empty `data` and the whole file as `body` — never an error, because a doc
 *  pulled straight from a code repo legitimately has none. */
export function parseFrontMatter(raw) {
  const text = raw.replace(/^﻿/, '');
  if (!text.startsWith(FENCE)) return { data: {}, body: text };

  const end = text.indexOf(`\n${FENCE}`, FENCE.length);
  if (end === -1) return { data: {}, body: text };

  const block = text.slice(FENCE.length, end);
  const body = text.slice(end + FENCE.length + 1).replace(/^\r?\n/, '');

  const data = {};
  for (const line of block.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const colon = trimmed.indexOf(':');
    if (colon === -1) continue;
    const key = trimmed.slice(0, colon).trim();
    let value = trimmed.slice(colon + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    data[key] = value;
  }
  return { data, body };
}

/** Serialise a flat object back into a front-matter block. Values are JSON-quoted
 *  so a title containing `:` (common — "HugMesh: the platform") round-trips. */
export function formatFrontMatter(data) {
  const lines = Object.entries(data)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${k}: ${JSON.stringify(String(v))}`);
  return `${FENCE}\n${lines.join('\n')}\n${FENCE}\n`;
}
