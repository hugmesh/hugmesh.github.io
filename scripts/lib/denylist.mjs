/**
 * The private-word list: words that must never be published by this site.
 *
 * The list is read from a file OUTSIDE this repository, never from the tree. An
 * earlier version kept sha256 hashes of the words here; an unsalted hash of a
 * dictionary word is reversed in under a second from a word list, so that published
 * the very words it was meant to keep out. Any committed form of a short word (hash,
 * salted hash, encoding) has the same flaw, so the words live only on the machines
 * that build or re-sync the site by hand.
 *
 * File: $HUGMESH_PRIVATE_DENYLIST_FILE, else ~/.config/hugmesh/private-denylist.txt.
 * One word or phrase per line, matched case-insensitively anywhere in the text (so
 * glued or CamelCase forms are caught too). Blank lines and lines starting with # are
 * ignored.
 *
 * THE ONE DELIBERATE SKIP: when no file exists at the default path the result is
 * `{ skipped }`, because a public CI runner and a stranger's clone can never have the
 * file, and failing there would only break every build. If the variable is set but
 * names a missing or empty file, that is a misconfiguration and the result is
 * `{ error }`. Callers name the denylist LINE NUMBER, never the word, so a log does
 * not publish it either.
 *
 * Used by check-content-integrity.mjs (the vendored pages, the tab intros and the
 * manifest) and by fetch-board.mjs (the project board data).
 */
import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';

export const DENYLIST_ENV = 'HUGMESH_PRIVATE_DENYLIST_FILE';
export const DEFAULT_DENYLIST = path.join(homedir(), '.config', 'hugmesh', 'private-denylist.txt');

/**
 * `{ entries: [{ word, line }] }`, or `{ skipped: file }` when there is no list on
 * this machine, or `{ error: sentence }` when the list is misconfigured.
 */
export async function loadDenylist(env = process.env) {
  const explicit = env[DENYLIST_ENV];
  const file = explicit || DEFAULT_DENYLIST;
  let raw;
  try {
    raw = await readFile(file, 'utf8');
  } catch (err) {
    if (err.code !== 'ENOENT' || explicit) {
      return { error: `${DENYLIST_ENV}=${file}: cannot read the private denylist (${err.code ?? err.message})` };
    }
    return { skipped: file };
  }
  const entries = [];
  raw.split(/\r?\n/).forEach((line, i) => {
    const word = line.trim().toLowerCase();
    if (word && !word.startsWith('#')) entries.push({ word, line: i + 1 });
  });
  if (!entries.length) {
    return { error: `${file}: the private denylist has no entries; a check with nothing to look for is not a check` };
  }
  return { entries };
}

/** The denylist line numbers whose word appears in `text`, in list order. */
export function denylistLines(text, entries) {
  const lower = String(text).toLowerCase();
  return entries.filter(({ word }) => lower.includes(word)).map(({ line }) => line);
}
