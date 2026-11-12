# hugmesh.github.io

Source for **[hugmesh.net](https://hugmesh.net)** — the HugMesh documentation site.

## How content gets here

The `hugmesh-*` code repositories and this one were private when the site was first
published, and are public now. Publication is still an **opt-in allowlist**, never a
glob, because a code repository also holds internal notes that are not written for
readers of the site:

```
code repos                    this repo                         the site
─────────────────────         ───────────────────               ────────
docs/DEVOPS.md          ──►   content/developer-guide/….md  ──►  /developer-guide/…
   (source of truth)          (vendored, committed)              (rendered at build)
```

1. **`docs.manifest.json`** lists every published document: its source repo and path,
   its section, slug and title. A document reaches the website because somebody listed
   it here. There is no "publish everything under `docs/`" mode, and adding one would
   turn every future internal note into an accidental disclosure. 40 further documents
   were reviewed and deliberately withheld.

2. **`npm run refresh:content`** pulls those files into `content/`. It reads from
   sibling checkouts (`../hugmesh-generator/…`) by default, or from GitHub with
   `--from-github`. This is a **maintainer** command, not a build step.

3. **`npm run build:content`** renders `content/` into `src/assets/content/` — one JSON
   per page with sanitised HTML, a table of contents and provenance, plus a nav index
   and a search index. This runs automatically before every build and test.

The site build reads **only** the committed `content/` tree, so a Pages build needs no
access to any other repository.

### Two different checks, for two different questions

|  | Question | Needs the network? | In CI |
|---|---|---|---|
| `npm run check:integrity` | Has a vendored document been **hand-edited**? | no | **blocking** |
| `npm run check:content` | Has **upstream moved on** since we synced? | yes | advisory |

**`check:integrity`** verifies every file under `content/` against
`content/.sync.lock.json` — a `sha256` per document, written by a full
`refresh:content`. It needs no checkouts and no credential, so it is a real gate on a
bare Pages runner. It fails when a vendored document was edited here, when an unlisted
file appears under `content/`, when the lock is missing or covers nothing, and when a
page the manifest promises is absent. **Every one of those is a failure, not a skip** —
a gate that can report "nothing to check" and still pass is not a gate.

Editing a vendored `.md` here is the failure it exists to catch: the next
`refresh:content` reverts your edit, or it survives and the published page no longer
matches the code it documents. Edit the **source repository** instead.

**`check:content`** compares against the sibling code repositories, so it can only run
where those are checked out. Run it before you commit. It compares bodies, not whole
files, so an upstream commit that did not change the prose is not reported as drift.
In `pages.yml` it is advisory: a Pages runner has no sibling checkouts, so it reports
"unreachable" and exits 0 there.

```bash
npm run check:integrity   # offline; the blocking gate
npm run check:content     # exits 1 and lists what is stale
npm run refresh:content   # pull the current text, and rewrite the lock
```

Only a **full, fully-successful** `refresh:content` rewrites the lock. A `--only` run,
or one where a source was unreachable, deliberately leaves it alone — otherwise a
partial sync would narrow the lock to whatever it happened to look at, and the
integrity check would quietly stop covering everything else.

To re-vendor **one** page after its source changed upstream, add `--update-lock`:

```bash
node scripts/sync-content.mjs --only studio/installers --update-lock
```

That replaces only that page's lock record (path, source, ref, sha256) and keeps every
other record as it was, so it cannot narrow the lock.

## Pages written here, and the files they were checked against

Some pages are not copies. The service pages under Reference, Gateways, What HugMesh is
and the first-mesh tutorial are written in this repository (`authored: "site"` in the
manifest), each as a short summary of files in a code repository. A copy can be proved
identical to its source. A summary cannot, so it goes stale without anyone noticing:
the upstream README changes and the page keeps saying what used to be true.

Every site-written page therefore declares the upstream files its facts come from:

```json
{ "section": "reference", "slug": "actions", "authored": "site",
  "basis": [{ "repo": "hugmesh-actions", "path": "README.md" },
            { "repo": "hugmesh-actions", "path": "src/main/resources/application.yml" }] }
```

`content/.basis.lock.json` records, for each of those files, the commit the page was
checked at and the file's `sha256` at that commit. `"basis": []` is allowed for a page
with no upstream file to track, but it has to be written out.

|  | Question | Needs the network? | In CI |
|---|---|---|---|
| `npm run check:integrity` | Does every declared file have a lock record? | no | **blocking** |
| `npm run check:basis` | Has a recorded file **changed upstream** since? | yes | warns |

`check:basis` fetches each file from GitHub's default branch with no credential (the
code repositories are public) and compares it with the recorded `sha256`. It compares
content, not commits, so a repository that merely moved on is not reported. A changed
file is a warning that names the page to re-read; it fails only when it could not read
a single file, because that run checked nothing. `--strict` makes a changed file exit 1,
and `--workspace <dir>` reads local checkouts (each repository's `HEAD` commit, never
its working tree) in place of GitHub.

When a page is reported:

```bash
# 1. read the page against the changed file, and correct the page
# 2. record the commit you read it against
node scripts/check-authored-basis.mjs --stamp --workspace .. --only reference/actions
```

A stamp says "I read this page against these files at this commit". Do not use it to
silence the warning. Each page shows its recorded files at the bottom, linked at the
recorded commit.

## Navigation: tabs, groups and redirects

`docs.manifest.json` also holds the site's navigation:

- **`sections`**: per tab, an optional `start` page, optional `index` page (its
  headings become an index on the tab) and ordered `groups` of routes. The order of a
  group's `pages` array is the order readers see. Every page is listed in exactly one
  group, its **nav home**, which may be a different tab from its URL prefix: a page can
  be filed where readers look for it without moving its URL. The breadcrumb, the
  sidebar, previous/next and the active header tab all follow the nav home.
- **`redirects`**: retired URLs and where their content went. The app follows them, and
  the build writes a small redirect page for each (left out of `sitemap.xml`).
- **`landings/<tab>.md`**: each tab's intro, written here and rendered like a
  site-authored page, so a broken link fails the build.

`scripts/lib/manifest.mjs` validates all of it and lints every title: a title is a
short name, with no dashes, slashes, repository names, ticket numbers or shouting.
`npm run test:releases` runs one failing fixture per rule (`scripts/manifest.test.mjs`).

## The project board

The Project board page (`/board`) lists the issues and pull requests on the
organisation's GitHub Project, *Hugmesh Launch* (`github.com/orgs/hugmesh/projects/1`),
grouped by their Status. A browser cannot read an organisation Project without signing
in to the GitHub API, so the page never talks to GitHub. Like the release data on the
Downloads page, the list is made during the Pages build and served as a file:

```
GitHub Project (GraphQL)  ──►  scripts/fetch-board.mjs  ──►  src/assets/board.json  ──►  /board
                               (pages.yml, every build)       (not committed)
```

**What is published.** Per item: title, issue or pull request, repository, number,
address, open/closed/merged, Status, Priority, Size, Wave, label names and the time it
last changed. The query asks GitHub for nothing else, so these never reach the build:
bodies, comments, assignees, the free-text Code/branch field, Team, Iteration and the
dates. An item is **left out and counted** when it is a draft note (no address), when
its repository is not public (the same query asks each repository's visibility, and an
item the token cannot see arrives with no content), or when it contains a word from
the private denylist on a machine that has one. `src/app/board/board-data.ts` is the
one validator for the file; the build refuses to write, and the page refuses to show,
a file with a key it does not know.

**When there is no board.** With no token (a fork, a local build, or this repository
until the secret below is added) the step writes a small file that says
`"state": "unavailable"` with a reason, the build stays green, and the page says the
board is not published here yet and links to GitHub. A board that cannot be read
**whole** (a network error, a refusal, GraphQL errors beside partial data, a page with
a hole in it, a count that does not add up) is never published as if it were all of
it: the file says "unavailable" with the reason and the run log shows a `::warning::`.
On the hourly run a temporary failure (`fetch-failed`, `incomplete`) does not replace a
good live board; `scripts/published-data-changed.mjs` holds that rule.

**The one secret the operator adds.** `BOARD_READ_TOKEN`, as an Actions secret:

- Where: this repository, *Settings → Secrets and variables → Actions → New repository
  secret* (or an organisation secret that is granted to this repository only).
- What: a token that can read Projects and nothing else. Either
  - a **fine-grained** token with *Resource owner* `hugmesh`, *Repository access*
    "Public repositories", and *Organization permissions → Projects: Read-only*
    (the organisation may have to approve it), or
  - a **classic** token with only the `read:project` scope.
- Its account must be able to see the board. A token that can also read the private
  repository is not needed: those items are dropped either way.

Only the "Fetch the project board" step in `.github/workflows/pages.yml` receives the
secret, in its own environment, before `npm ci` has put any third-party code on the
runner. `scripts/pages-workflow.test.mjs` fails if that changes. The token is never an
argument and is never printed, and the public file and log hold fixed reason words,
never GitHub's own error text.

To try it locally, without putting the token in shell history:

```bash
read -rs BOARD_READ_TOKEN && export BOARD_READ_TOKEN
npm run fetch:board        # writes src/assets/board.json (git-ignored)
unset BOARD_READ_TOKEN
```

Without the variable it writes the "unavailable" file. With no file at all (a plain
`npm start`) the page says the same: the board is not published here yet.

## Local development

```bash
npm ci
npm start                 # ng serve on :4200
npm test                  # unit specs, headless Chrome
npm run build             # production build into dist/browser
node scripts/serve-dist.mjs   # preview the BUILT site on :8899
```

Use `serve-dist.mjs` rather than a generic static server to check anything about
routing. It reproduces **GitHub Pages' serving semantics** — serve the file if it
exists, otherwise return `404.html` with a real 404 status. `ng serve` is friendlier
than production (it rewrites every unknown path to `index.html` with a 200), which is
exactly how a broken deep link reaches production looking fine locally.

## How deep links work on Pages

GitHub Pages has no rewrite rules. A cold request for `/developer-guide/argocd-gitops`
has no file to serve, so Pages returns `404.html` — and `scripts/spa-fallback.mjs`
makes `404.html` a byte-copy of `index.html`. The app boots, the router resolves the
real path, and the reader never sees a 404. `pages.yml` asserts the two files are
identical, because that breakage would appear **only** in production.

The same script writes `.nojekyll` (without it Pages runs Jekyll and drops every path
starting with an underscore — which is how Angular names some chunks) and verifies the
`CNAME` survived the build.

## Layout

| Path | What it is |
|---|---|
| `docs.manifest.json` | the publication allowlist, the tabs' groups and the redirects |
| `landings/` | each tab's intro, site-authored |
| `content/` | vendored Markdown, committed, regenerated by `refresh:content` |
| `content/.basis.lock.json` | what each site-written page was last checked against |
| `scripts/check-authored-basis.mjs` | `check:basis`: have those upstream files changed? |
| `scripts/sync-content.mjs` | pulls `content/` from the code repos |
| `scripts/build-content.mjs` | renders `content/` → `src/assets/content/` |
| `scripts/spa-fallback.mjs` | post-build: `404.html`, `.nojekyll`, CNAME assertion |
| `scripts/serve-dist.mjs` | local preview with Pages semantics |
| `scripts/fetch-board.mjs` | Pages build: the project board → `src/assets/board.json` |
| `src/app/board/` | the Project board page, and the one validator for its data |
| `docs/go-live-cloudflare.md` | the Cloudflare + Pages go-live runbook |
| `src/app/content/` | the document renderer, section index and content service |
| `src/app/layout/` | header, section rail, footer |
| `src/app/search/` | the client-side search page and its scorer |
