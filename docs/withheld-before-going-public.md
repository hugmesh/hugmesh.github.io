# Documents withheld before the repositories went public

Nine vendored documents were taken out of `docs.manifest.json` (and their `content/`
copies deleted) just before the hugmesh repositories were made public. Their upstream
text still carries an old pre-rebrand deployment name that must not be published (in a
descriptor file name, a Liquibase changeset file name and a reverse-DNS key prefix).

| Page | Source |
|---|---|
| architecture/federation-walkthrough | hugmesh-generator `docs/FEDERATION-EXAMPLES.md` |
| architecture/mesh-repo-templating | hugmesh-generator `docs/MESH-TEMPLATING.md` |
| operations/devops-namespace | hugmesh-generator `docs/DEVOPS.md` |
| operations/meshtastic-bridge | hugmesh-generator `docs/MESHTASTIC-BRIDGE.md` |
| operations/xr-chat | hugmesh-generator `docs/XR-CHAT.md` |
| games/add-a-game | hugmesh-games `docs/wiki/howto/add-game.md` |
| games/extending | hugmesh-games `docs/wiki/architecture/07-extending.md` |
| games/godot-developer | hugmesh-games `docs/wiki/guides/godot-developer.md` |
| games/godot-developer-guide | hugmesh-games `docs/GODOT_DEVELOPER_GUIDE.md` |

The host-shell security policy (`security/host-shell-security`) was briefly withheld
too, because it listed a personal email address as the report contact. Its source was
fixed first (hugmesh-host-shell `SECURITY.md` now sends reports to GitHub private
vulnerability reporting), so it was re-vendored from that fixed source with
`node scripts/sync-content.mjs --only security/host-shell-security --from-github`
and is published again.

## The private-word check (check 5)

`scripts/check-content-integrity.mjs` refuses any published page, or the manifest,
that contains a word from a private denylist. The words are NOT in this repository in
any form: a hash of a short dictionary word is reversed in under a second, so a hashed
list would publish the very words it keeps out. The list lives in a local file:

- `$HUGMESH_PRIVATE_DENYLIST_FILE`, or else `~/.config/hugmesh/private-denylist.txt`;
- one word or phrase per line, matched case-insensitively anywhere in the text;
  blank lines and `#` comments are ignored.

**The check only protects machines that have that file.** Without it, check 5 prints a
`WARNING: check 5 (private denylist) SKIPPED` line and the rest of the integrity check
still runs (a public CI runner can never have the file, so failing there would only
break every build). If the variable is set but the file is missing or empty, the check
fails. Failure messages name the denylist line number, never the word.

Create the file on every machine that runs `refresh:content` before running it.

## Putting a withheld page back

1. Fix the wording in the source repository and merge it to that repository's `main`.
2. Restore the entry in `docs.manifest.json` (the removed entries are in commit
   5c41a45; `git show 5c41a45 -- docs.manifest.json`).
3. Run a FULL `npm run refresh:content` (or `node scripts/sync-content.mjs --from-github`).
   Only a full sync with every source reachable rewrites `content/.sync.lock.json`.
4. `npm run check:integrity` must pass, on a machine that has the denylist file.

Why the lock was edited by script on this branch: a full refresh was not possible on
the day (one source, the `.github` profile README, returned 404, and 161 other
documents had drifted upstream, too much to review before the deadline). The nine
records for the nine removed documents were removed, exactly what a full sync would
have done for them, and the one record for the re-vendored security policy was
replaced with the hash of the file `--only` wrote (a `--only` run never writes the
lock). Every other record is byte-for-byte unchanged.
