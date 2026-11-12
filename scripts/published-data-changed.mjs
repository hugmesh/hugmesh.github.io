#!/usr/bin/env node
/**
 * On the hourly Pages run: did the data this build fetched change from what the live
 * site already serves?
 *
 *   node scripts/published-data-changed.mjs <dir with the live copies> <dir with the built copies>
 *
 * Both directories hold releases.json and board.json (a live copy that could not be
 * downloaded is simply absent). Exit status 0 means "nothing changed, skip this
 * deploy"; anything else means deploy. So a crash, a wrong argument or an unreadable
 * file all end in a deploy: the failure mode is one redundant deploy, never a
 * release or a board change that stays unpublished.
 *
 * Each file is compared with its generation time left out, since that differs on
 * every run by itself.
 *
 * ONE EXCEPTION, AND ITS LIMIT. A build that could not reach GitHub writes a board
 * file that says "unavailable". If that alone counted as a change, a network blip at
 * :17 past the hour would replace a good live board with "not shown here" until the
 * next run. So when THIS build's board is unavailable for a reason that passes by
 * itself (fetch-failed, incomplete), the board is left out of the comparison and the
 * live copy stays, with its own, older, time on it. A reason that does not pass by
 * itself (the token is gone or refused, a private word, an invalid file) is compared
 * like any other change, so the live page then says the board is not shown: a stale
 * board nobody is told about is worse than an honest gap.
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

/** Reasons a later run is expected to clear without anyone doing anything. */
export const PASSING_REASONS = new Set(['fetch-failed', 'incomplete']);

function parse(text) {
  if (typeof text !== 'string') return null;
  try {
    const v = JSON.parse(text);
    return typeof v === 'object' && v !== null && !Array.isArray(v) ? v : null;
  } catch {
    return null;
  }
}

/** The file's content without the time it was generated, in a form that compares. */
function comparable(data) {
  const { generated: _generated, ...rest } = data;
  return JSON.stringify(rest);
}

/**
 * `live` and `built` are `{ releases, board }`, each the file's text or null when
 * there is no such file. Returns `{ changed, reasons }`; `reasons` says, in plain
 * sentences, what was found for each file.
 */
export function publishedDataChanged({ live, built }) {
  const reasons = [];
  let changed = false;
  const differs = (what, liveText, builtData) => {
    const liveData = parse(liveText);
    if (!liveData) {
      changed = true;
      reasons.push(`${what}: the live copy is missing or unreadable, so this counts as a change`);
    } else if (comparable(liveData) !== comparable(builtData)) {
      changed = true;
      reasons.push(`${what}: changed since the last deploy`);
    } else {
      reasons.push(`${what}: unchanged`);
    }
  };

  const releases = parse(built.releases);
  if (!releases) {
    changed = true;
    reasons.push('release data: this build has none that can be read, so this counts as a change');
  } else {
    differs('release data', live.releases, releases);
  }

  const board = parse(built.board);
  if (!board) {
    changed = true;
    reasons.push('project board: this build has none that can be read, so this counts as a change');
  } else if (board.state === 'unavailable' && PASSING_REASONS.has(board.reason)) {
    reasons.push(`project board: this build could not read it (${board.reason}); the live copy is left as it is`);
  } else {
    differs('project board', live.board, board);
  }
  return { changed, reasons };
}

async function main(argv) {
  const [liveDir, builtDir] = argv;
  if (!liveDir || !builtDir) {
    console.error('usage: published-data-changed.mjs <live dir> <built dir>');
    process.exit(2);
  }
  const read = (dir, name) => readFile(path.join(dir, name), 'utf8').catch(() => null);
  const { changed, reasons } = publishedDataChanged({
    live: { releases: await read(liveDir, 'releases.json'), board: await read(liveDir, 'board.json') },
    built: { releases: await read(builtDir, 'releases.json'), board: await read(builtDir, 'board.json') },
  });
  for (const r of reasons) console.log(`published-data-changed: ${r}`);
  process.exit(changed ? 1 : 0);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main(process.argv.slice(2)).catch((e) => {
    console.error(`published-data-changed: FAILED: ${e?.message ?? e}`);
    process.exit(2);
  });
}
