# hugmesh.github.io

Source for **[hugmesh.net](https://hugmesh.net)** — the HugMesh documentation site.

## How content gets here

Every `hugmesh-*` code repository is **private**, and so is this one (decisions 115a/115b).
The site built from this repository is what is meant to be public, so publication is
an **opt-in allowlist**, never a glob:

```
code repos (private)          this repo (private)               the site
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
In `pages.yml` it is advisory — a Pages runner has neither the checkouts nor a
credential for the private repositories, so it reports "unreachable" and exits 0
there, and becomes meaningful the day the repositories are public.

```bash
npm run check:integrity   # offline; the blocking gate
npm run check:content     # exits 1 and lists what is stale
npm run refresh:content   # pull the current text, and rewrite the lock
```

Only a **full, fully-successful** `refresh:content` rewrites the lock. A `--only` run,
or one where a source was unreachable, deliberately leaves it alone — otherwise a
partial sync would narrow the lock to whatever it happened to look at, and the
integrity check would quietly stop covering everything else.

## Local development

```bash
npm ci
npm start                 # ng serve on :4200
npm test                  # 86 unit specs, headless Chrome
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
| `docs.manifest.json` | the publication allowlist |
| `content/` | vendored Markdown, committed, regenerated by `refresh:content` |
| `scripts/sync-content.mjs` | pulls `content/` from the code repos |
| `scripts/build-content.mjs` | renders `content/` → `src/assets/content/` |
| `scripts/spa-fallback.mjs` | post-build: `404.html`, `.nojekyll`, CNAME assertion |
| `scripts/serve-dist.mjs` | local preview with Pages semantics |
| `docs/go-live-cloudflare.md` | the Cloudflare + Pages go-live runbook |
| `src/app/content/` | the document renderer, section index and content service |
| `src/app/layout/` | header, section rail, footer |
| `src/app/search/` | the client-side search page and its scorer |
