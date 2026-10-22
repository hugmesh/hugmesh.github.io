# Documents withheld before the repositories went public

Ten vendored documents were taken out of `docs.manifest.json` (and their `content/`
copies deleted) just before the hugmesh repositories were made public. Their upstream
text still carried names that must not be published: an old pre-rebrand deployment
name (in a descriptor file name, a Liquibase changeset file name and a reverse-DNS key
prefix), and a personal email address as the security contact.

`scripts/check-content-integrity.mjs` now refuses any published page that contains one
of those words (check 5, stored as hashes), so re-adding a document before its source
is fixed fails the build instead of publishing it.

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
| security/host-shell-security | hugmesh-host-shell `SECURITY.md` |

## Putting them back

1. Fix the wording in the source repository and merge it to that repository's `main`.
2. Restore the entry in `docs.manifest.json` (the removed entries are in the commit
   that added this file; `git show <that commit> -- docs.manifest.json`).
3. Run a FULL `npm run refresh:content` (or `node scripts/sync-content.mjs --from-github`).
   Only a full sync with every source reachable rewrites `content/.sync.lock.json`.
4. `npm run check:integrity` must pass.

Why the lock was trimmed by script this once: a full refresh was not possible on the
day (one source, the `.github` profile README, returned 404, and 161 other documents
had drifted upstream, too much to review before the deadline). Removing the ten
records for the ten removed documents is exactly what a full sync would have done for
them; every other record is byte-for-byte unchanged.
