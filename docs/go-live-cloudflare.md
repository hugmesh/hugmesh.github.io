# Going live: Cloudflare + GitHub Pages for `hugmesh.net`

The exact configuration to publish this site at `hugmesh.net`. Every step is in the
operator's Cloudflare account or this repository's GitHub settings — **no agent and no
CI job can do any of it**, which is why hugmesh.github.io#15 is BLOCKED rather than
planned.

This file is a runbook, not a secret store. It contains only values that are already
observable from public DNS, and nothing here is a credential. Do not add one.

Everything under "Where this stands" was **measured from this repository's checkout on
2026-09-17 ~21:45Z**, with the commands given beside it. `dig` is not installed on the
build box, so DNS was read over DNS-over-HTTPS:

```bash
q() { curl -s -H 'accept: application/dns-json' \
        "https://cloudflare-dns.com/dns-query?name=$1&type=$2"; echo; }
q hugmesh.net A ; q hugmesh.net AAAA ; q hugmesh.net CNAME ; q hugmesh.net NS ; q hugmesh.net DS
```

---

## Where this stands

| Fact | Measured value | Command |
|---|---|---|
| The zone is already on Cloudflare | `NS alexia.ns.cloudflare.com`, `gabriel.ns.cloudflare.com` | `q hugmesh.net NS` |
| DNSSEC is already **on** | `DS 2371 13 2 78037bcd0f83078c3764837846e44374d5d20bf1d4203afd5d806d57da105902` | `q hugmesh.net DS` |
| **The apex has no record at all** | `A`, `AAAA` and `CNAME` all return NOERROR/NODATA (SOA in AUTHORITY, no ANSWER) | `q hugmesh.net A` |
| …so the apex does not resolve | `curl: (6) Could not resolve host: hugmesh.net` | `curl -sSI https://hugmesh.net/` |
| **`www.hugmesh.net` already exists, is proxied, and is broken** | `104.21.84.37`, `172.67.186.17` → **HTTP 530, Cloudflare error 1016 "Origin DNS error"** | `curl -sS -o /dev/null -D - https://www.hugmesh.net/` |
| …and those are Cloudflare edge IPs | `104.21.84.37` ∈ `104.16.0.0/13`, `172.67.186.17` ∈ `172.64.0.0/13` | `curl -sS https://www.cloudflare.com/ips-v4` |
| GitHub Pages is **not** enabled here | `"private": true`, `"has_pages": false`; `GET /repos/hugmesh/hugmesh.github.io/pages` → `404 Not Found` | `gh api repos/hugmesh/hugmesh.github.io` |
| `hugmesh.github.io` answers, but with nothing | `185.199.108-111.153`, `2606:50c0:800{0,1,2,3}::153`; `HTTP/2 404` — *"There isn't a GitHub Pages site here"* | `curl -sS https://hugmesh.github.io/` |
| A Pages origin caches for 10 minutes | `cache-control: max-age=600` on the two `200`s I probed (HTML and JSON) on another Pages site. `hugmesh.github.io`'s own `404` carries **no** `cache-control` at all — re-measure on this site once it serves `200`s | `curl -sSI https://pages.github.com/` ; `curl -sSI https://pages.github.com/versions.json` ; `curl -sSI https://hugmesh.github.io/` |

Two things in that table are not just "nothing configured yet":

1. **`www.hugmesh.net` is live and failing right now.** Error 1016 means a *proxied*
   DNS record exists whose origin hostname does not resolve. Anyone who types
   `www.hugmesh.net` today gets a Cloudflare error page. It has to be repointed or
   deleted as part of go-live — see the open question at the bottom.
2. **The apex is free, but the subdomain namespace is not.** The published docs in this
   repository already name `registry.`, `attestation.`, `id.`, `scale.`, `admin.`,
   `gitlab.`, `games.`, `vault.`, `platform.`, `matrix.`, `mastodon.` and `ai.`
   `.hugmesh.net` as mesh service hostnames
   (`grep -rhoaE '[A-Za-z0-9_-]+\.hugmesh\.net' content/ src/`). The docs site takes the
   **apex and `www` only**. Never create a wildcard — see step B3.

---

## What this repository already commits to

| Where | What it says |
|---|---|
| `src/CNAME:1` | `hugmesh.net` — the apex, shipped inside the Pages artifact |
| `angular.json:46` | `src/CNAME` is an asset, so the build copies it into `dist/browser` |
| `scripts/spa-fallback.mjs:47-53` | the build **fails** if `CNAME` is missing from the output |
| `.github/workflows/pages.yml:90-92` | step *"Verify the Pages artifact"* re-asserts `index.html`, `404.html`, `CNAME`, `.nojekyll` |
| `.github/workflows/pages.yml:12-16` | the four prerequisites, as prose (`:17-20` points back here) |
| `.github/workflows/pages.yml:101-142` | step `id: probe` — the deploy is **probed and skipped**, not failed, until Pages is enabled |
| `src/index.html:5` | `<base href="/">` — the site must be served from the **domain root** |
| `src/index.html:27,41` | `og:url` and `rel=canonical` are already `https://hugmesh.net/` |
| `angular.json:85` | `outputHashing: "all"` — Angular's own `.js`/`.css` are content-hashed |
| `angular.json:47-51` | `src/assets/**` is copied verbatim to `assets/**` and is **not** hashed |
| `scripts/build-content.mjs:346-347,423-425,456-457,470` | `assets/content/**` is deleted and rewritten on **every** build, under stable names |

The last two rows are the whole reason the cache rules in step E look the way they do.

---

## A. Pre-flight, no DNS change yet

- **A1. Make the repository public.** On the Free plan it is GitHub Pages *itself* —
  not merely the custom domain — that requires a public repository; the pre-existing
  prose at `.github/workflows/pages.yml:13` says "custom domains", which understates it.
  The operator action is identical either way. Verify:
  `gh api repos/hugmesh/hugmesh.github.io --jq .visibility` → `public`.
- **A2. Settings → Pages → Source = "GitHub Actions".** The workflow deliberately does
  **not** call `actions/configure-pages` with `enablement: true`, because enabling
  publication silently is an operator decision (`pages.yml:103-107`, the comment above
  `id: probe`).
- **A3. Leave the custom domain blank for now.** Set it in step C, after DNS exists, so
  GitHub's DNS check passes on the first attempt instead of sitting in an error state.

## B. DNS in Cloudflare — **DNS only (grey cloud) at this stage**

The grey cloud is not optional here. It is what lets GitHub complete its ACME
validation and issue a Let's Encrypt certificate for `hugmesh.net`. Turn the proxy on
in step D, after the certificate exists.

**B1. The apex.** Pick one shape:

*Option 1 — recommended, and what `pages.yml:16` already assumes:*

| Type | Name | Target | Proxy | TTL |
|---|---|---|---|---|
| `CNAME` | `@` (displays as `hugmesh.net`) | `hugmesh.github.io` | **DNS only** | Auto |

Cloudflare flattens apex `CNAME`s, so the authoritative answer is GitHub's own address
set and GitHub's DNS check is satisfied. An apex `CNAME` is illegal in plain DNS
(RFC 1912 §2.4) — this works *because* the zone is on Cloudflare, which is already true.

*Option 2 — GitHub's documented apex shape, if you would rather not depend on flattening:*

| Type | Name | Values |
|---|---|---|
| `A` | `@` | `185.199.108.153`, `185.199.109.153`, `185.199.110.153`, `185.199.111.153` |
| `AAAA` | `@` | `2606:50c0:8000::153`, `2606:50c0:8001::153`, `2606:50c0:8002::153`, `2606:50c0:8003::153` |

Those eight values were measured from `hugmesh.github.io` on 2026-09-17. **GitHub has
changed this set before.** Re-read it on the day
(`curl -s -H 'accept: application/dns-json' 'https://cloudflare-dns.com/dns-query?name=hugmesh.github.io&type=A'`)
and re-check GitHub's docs. Option 1 survives such a change with no edit; Option 2 does
not. That is the reason to prefer Option 1.

**B2. `www`.** A record for `www` **already exists and is broken** (error 1016). Edit or
delete it — do not add a second one beside it:

| Type | Name | Target | Proxy | TTL |
|---|---|---|---|---|
| `CNAME` | `www` | `hugmesh.github.io` | **DNS only** initially, proxied in step D | Auto |

With the artifact's `CNAME` file naming the apex (`src/CNAME:1`), GitHub Pages issues
the `www → apex` 301 itself; no Cloudflare redirect rule is needed for it.

**B3. Do NOT create `*.hugmesh.net`.** Pages matches on the `Host` header against the
one configured custom domain; every other host gets *"There isn't a GitHub Pages site
here"* (measured above on `hugmesh.github.io`). A wildcard pointed at Pages would take
over all twelve mesh service hostnames listed in "Where this stands" and answer 404 for
each.

**B4. CAA: leave it unset.** There is no CAA record today (`q hugmesh.net CAA` → NODATA),
so nothing restricts issuance. If one is ever added it must permit `letsencrypt.org`
(GitHub Pages) **and** Cloudflare's Universal SSL issuers, or the site loses its
certificate at the next renewal. The simplest correct answer is to add none.

**B5. DNSSEC: leave it on.** It is already signed at the parent, and none of the above
interacts with it.

## C. GitHub custom domain and certificate

- **C1.** Settings → Pages → Custom domain = `hugmesh.net` → Save. Wait for
  *"DNS check successful"*.
- **C2.** Wait for the certificate. GitHub requests a Let's Encrypt certificate once the
  DNS check passes; "Enforce HTTPS" stays greyed out until it is issued (minutes,
  occasionally up to an hour).
- **C3.** Tick **Enforce HTTPS**.
- **C4. Precondition test for step D** — run this *before* turning the orange cloud on.
  It talks to a GitHub Pages address directly with the apex as SNI, which is exactly
  what Cloudflare will do in Full (strict) mode:

  ```bash
  curl -sS -m 15 -o /dev/null -D - --resolve hugmesh.net:443:185.199.108.153 \
       https://hugmesh.net/ | head -3
  ```

  A `HTTP/2 200` means GitHub is serving a publicly trusted certificate for the apex and
  Full (strict) will work. A TLS error means C2 has not finished — **do not proceed**.

  Run the **same test for `www`** before D3 proxies it, because Full (strict) validates
  the origin certificate per hostname and GitHub issues a separate certificate for the
  `www` variant:

  ```bash
  curl -sS -m 15 -o /dev/null -D - --resolve www.hugmesh.net:443:185.199.108.153 \
       https://www.hugmesh.net/ | head -3
  ```

  Expect a `301` to `https://hugmesh.net/` over a valid certificate. A TLS error here
  means the `www` certificate has not been issued yet — **leave `www` DNS-only** and flip
  only the apex in D3; the same do-not-proceed rule applies to each hostname separately.

- **C5.** Keep `src/CNAME` and the GitHub setting in agreement. They are two records of
  the same fact: the Settings value binds the domain, and the file in the artifact keeps
  it bound across deploys. If the domain ever changes, change both in the same PR, or the
  next deploy silently unbinds it — the symptom (the site is suddenly back at
  `hugmesh.github.io`) shows up long after the cause (`scripts/spa-fallback.mjs:44-46`).

## D. Turn the proxy on

- **D1. SSL/TLS → Overview → "Full (strict)".**
  **Never "Flexible".** Flexible terminates TLS at Cloudflare and fetches the origin over
  plain HTTP; GitHub's "Enforce HTTPS" 301s that straight back to HTTPS; the browser sees
  an infinite redirect loop (`ERR_TOO_MANY_REDIRECTS`). Full (strict) is correct *only
  after* C2/C3, which is when GitHub starts presenting a valid certificate for the apex —
  hence the C4 test.
- **D2. SSL/TLS → Edge Certificates:** Always Use HTTPS **On**; Automatic HTTPS Rewrites
  **On**; Minimum TLS Version **1.2**; TLS 1.3, HTTP/2 and HTTP/3 **On** (HTTP/3 is
  already enabled on this zone — today's `www` probe answered over `HTTP/3`).
- **D3.** Flip the apex and `www` records from DNS-only to **Proxied**.
- **D4. HSTS: leave it off for now.** It is a one-way door for the `max-age` you pick —
  a browser that has seen the header will refuse the site over HTTP until it expires,
  and there is a standing scar in this fleet from exactly that
  (`reference_hugmesh_localhost_hsts_trap`). If you do want it, enable it only once the
  apex is settled, start with a short `max-age`, and do not tick preload.

## E. Cache rules

**The minimum safe configuration is to add none.** GitHub Pages sent
`cache-control: max-age=600` on both `200` responses I probed (see "Where this stands";
the one `404` I could probe carried none, and a `404` is not cached hard by default
either), and Cloudflare's default cache behaviour respects the origin, so nothing is
held at the edge longer than ten minutes and a deploy is visible within one TTL.
Confirm that with `curl -sSI https://hugmesh.net/` once step C is done, before deciding
whether any rule is worth adding. Add rules only to make the hashed bundles cache
longer — and if you do, add **both** of these, in this order, under Rules → Cache Rules.

**Rule 1 — "docs: never cache the shell or the content payload"**

```
(http.request.uri.path eq "/")
or (http.request.uri.path eq "/index.html")
or (http.request.uri.path eq "/404.html")
or (starts_with(http.request.uri.path, "/assets/content/"))
```
→ Cache eligibility: **Bypass cache**

Why each entry is in that list:
- `/`, `/index.html`, `/404.html` are unhashed, and `404.html` is a byte-for-byte copy of
  `index.html` (`scripts/spa-fallback.mjs:41`, asserted by the `cmp -s` at
  `pages.yml:93-96`). They name
  the hashed bundles; a stale one points at bundles that no longer exist and the site is
  blank. **Note what this list does not name:** Pages serves that same unhashed shell at
  *every* SPA route (`/developer-guide/…` and so on — that is the whole point of the
  `404.html` copy). Those paths are extensionless, so Cloudflare's default
  extension-based caching already leaves them uncached and Rule 1 is sufficient as
  written. If anyone ever adds a "Cache Everything" rule to this zone, this bypass list
  stops covering the shell and must be widened first.
- `/assets/content/**` is `index.json`, `search.json` and one JSON per page. The build
  **deletes and regenerates the whole tree every time** under names that never change
  (`scripts/build-content.mjs:346-347`, `:423-425`, `:456-457`, `:470`). Caching it hard
  means a documentation change ships and is invisible.

**Rule 2 — "docs: cache the hashed bundles"**

```
(http.request.uri.path.extension in {"js" "css"})
and (not starts_with(http.request.uri.path, "/assets/"))
```
→ Cache eligibility **Eligible**, Edge TTL **1 month**, Browser TTL **1 month**

The `not /assets/` clause is load-bearing. `outputHashing: "all"` (`angular.json:85`)
hashes only what Angular *emits*; everything under `src/assets/` is copied verbatim
(`angular.json:47-51`). `assets/img/captures/*` in particular keeps its filename when a
screenshot is re-captured, so a month-long edge TTL there would serve the old picture
until somebody purged it by hand.

If you ever do need one, the purge is Caching → Configuration → Purge Everything (or
purge by URL for a single file). Nothing in the deploy pipeline calls the Cloudflare API,
and nothing should — that would need an API token in repository secrets, and the rules
above are written so no purge is required.

## F. Cloudflare features that would break this specific site

| Feature | Setting | Why |
|---|---|---|
| **Rocket Loader** | **Off** | It defers and re-orders `<script>` execution. An Angular SPA whose bootstrap is a module script is precisely the workload it breaks. |
| **Auto Minify** | **Off** / absent | The bundles are already minified (`angular.json:65-72`); re-minifying only risks corruption. Cloudflare removed this control in 2024 — if the zone still shows it, leave it off. |
| **Bot Fight Mode / "I'm Under Attack"** | **Off** | Both inject a JS interstitial. It blocks crawlers on a documentation site and breaks the `fetch()` of `assets/content/*.json`, which is how every page loads. |
| **Email Obfuscation** | **Off** (recommended) | Harmless but useless here: the only `mailto:` is `sales@hugmesh.net` at `src/app/home/home.component.html:219`, which lives inside a compiled JS bundle, not in the HTML Cloudflare rewrites. It also injects `/cdn-cgi/scripts/…/email-decode.min.js`, which any CSP added later would then have to allow. |
| **Polish / Mirage** | Optional | Would recompress `assets/img/captures/*`. Safe, but see Rule 2 above before caching those hard. |
| **Brotli** | On | Fine. |
| **Any path-prefix redirect or Worker route** | Don't | `src/index.html:5` is `<base href="/">`. The site must be served from the domain root. |
| **A response-header CSP via Transform Rules** | Only with care | `src/index.html:32-37` loads Google Fonts from `fonts.googleapis.com` and `fonts.gstatic.com`. A CSP that omits them silently strips the site's typeface. |

## G. Verification — this is what closes hugmesh.github.io#15

All read-only, runnable from anywhere. Paste the **unedited** output on the issue.

```bash
# 1. GitHub's own view of the binding — the single best piece of evidence
env -u GH_TOKEN -u GITHUB_TOKEN gh api repos/hugmesh/hugmesh.github.io/pages \
  --jq '{cname, https_enforced, status, html_url, protected_domain_state}'
# expect: cname "hugmesh.net", https_enforced true, status "built"

# 2. the apex serves the site through Cloudflare
curl -sSI https://hugmesh.net/ | head -20
# expect: 200, server: cloudflare, content-type: text/html

# 3. the SPA deep-link fallback survives the edge
curl -sS https://hugmesh.net/developer-guide/argocd-gitops | grep -c '<hug-root>'
# expect: 1   (the HTTP status is 404 by design — Pages serves 404.html, which IS
#              index.html; the router then renders the real page)

# 4. the content payload is reachable, JSON, and not being cached
curl -sSI https://hugmesh.net/assets/content/index.json | head -12
# expect: 200, application/json, and cf-cache-status: BYPASS if Rule 1 is in place

# 5. www redirects to the apex and no longer 1016s
curl -sS -o /dev/null -D - https://www.hugmesh.net/ | grep -iE '^(HTTP|location)'
# expect: 301 -> https://hugmesh.net/    (today: HTTP 530, error 1016)

# 6. http is upgraded, not looped — this is the Flexible-SSL detector
curl -sS -o /dev/null -w '%{num_redirects} %{url_effective} %{http_code}\n' -L http://hugmesh.net/
# expect: 1-2 redirects, ending at https://hugmesh.net/ with 200.
#         A double-digit redirect count or curl error 47 means SSL/TLS mode is Flexible.

# 7. no wildcard leak onto the mesh names
curl -sS -o /dev/null -w '%{http_code}\n' https://id.hugmesh.net/
# expect: anything EXCEPT the docs site. Today id.hugmesh.net has no record, so this
#         exits 6 ("Could not resolve host") and prints 000 — that is a PASS by
#         absence, not a measurement. The real check is the day a mesh hostname does
#         resolve: if it then returns the docs front page, a wildcard record was
#         created — see B3. Cross-check meanwhile with
#         `q '*.hugmesh.net' A`, which must be NOERROR/NODATA.
```

The issue can be closed when (1) reports `cname: hugmesh.net` with
`https_enforced: true` and `status: built`, and (2) through (6) match. Nothing an agent
can run from a build box moves any of that: every remaining action is inside the
operator's Cloudflare dashboard and this repository's settings.

---

## Open question for the operator

**What is `www.hugmesh.net` for?** There is a proxied record on it today whose origin
does not resolve (HTTP 530 / Cloudflare error 1016, measured). Two answers, and this
runbook cannot pick one:

- **(a)** `www` is the docs site's alias → set it as in **B2**, and GitHub Pages will
  301 it to the apex for free.
- **(b)** `www` is reserved for something else (a mesh deployment, a redirect to a
  different property) → say what, and **delete the broken record** regardless; leaving a
  live 1016 on the marketing hostname through go-live is worse than having no record.

Nothing else in this checklist depends on the answer.
