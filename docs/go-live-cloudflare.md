# Going live: Cloudflare + GitHub Pages for `hugmesh.net`

The exact configuration to publish this site at `hugmesh.net`. Every step is in the
operator's Cloudflare account or this repository's GitHub settings — **no agent and no
CI job can do any of it**, which is why hugmesh.github.io#15 is BLOCKED rather than
planned.

This file is a runbook, not a secret store. It contains only values that are already
observable from public DNS, and nothing here is a credential. Do not add one.

Everything under "Where this stands" was **measured from this repository's checkout on
2026-09-17 ~21:45Z, re-measured at 23:13-23:16Z and measured a third time at 23:57Z**,
with the commands given beside it. All three readings agree; the re-measures are noted
because the two facts that drive section **B** — the apex having no record, and `www`
answering a live 1016 — are the ones a reader is most likely to assume have already been
fixed. `dig` is not installed on the build box, so DNS was read over DNS-over-HTTPS:

```bash
q() { curl -s -H 'accept: application/dns-json' \
        "https://cloudflare-dns.com/dns-query?name=$1&type=$2"; echo; }
q hugmesh.net A ; q hugmesh.net AAAA ; q hugmesh.net CNAME ; q hugmesh.net NS ; q hugmesh.net DS
q www.hugmesh.net A ; q www.hugmesh.net AAAA ; q www.hugmesh.net CNAME
```

---

## Where this stands

| Fact | Measured value | Command |
|---|---|---|
| The zone is already on Cloudflare | `NS alexia.ns.cloudflare.com`, `gabriel.ns.cloudflare.com` | `q hugmesh.net NS` |
| DNSSEC is already **on** | `DS 2371 13 2 78037bcd0f83078c3764837846e44374d5d20bf1d4203afd5d806d57da105902` | `q hugmesh.net DS` |
| **The apex has no record at all** | `A`, `AAAA` and `CNAME` all return NOERROR/NODATA (SOA in AUTHORITY, no ANSWER) — unchanged on the 23:16Z re-measure | `q hugmesh.net A` |
| …so the apex does not resolve | `curl: (6) Could not resolve host: hugmesh.net (DNS server returned answer with no data)` | `curl -sSI https://hugmesh.net/` |
| **`www.hugmesh.net` already exists, is proxied, and is broken** | `A 104.21.84.37`, `172.67.186.17`; `AAAA 2606:4700:3030::6815:5425`, `2606:4700:3031::ac43:ba11` → **HTTP 530, Cloudflare error 1016 "Origin DNS error"** | `curl -sS -o /dev/null -D - https://www.hugmesh.net/` |
| …on plain `http://` too, not only `https://` | `HTTP/1.1 530`, `server: cloudflare`, same `error code: 1016` in the body | `curl -sS -o /dev/null -D - http://www.hugmesh.net/` |
| …and it really is *proxied* | **the 1016 itself is the proof** — only a hostname Cloudflare is configured to proxy gets a Cloudflare *error page* rather than a connection failure. (`q www.hugmesh.net CNAME` → NOERROR/**NODATA** while `A`/`AAAA` answer is *consistent* with a proxied `CNAME`, but does not prove it: a plain DNS-only `A` record aimed at those same addresses would read identically.) A proxied record hides its target, which is visible only in the dashboard, which is why this runbook cannot name what `www` points at today | `curl -sS https://www.hugmesh.net/` ; `q www.hugmesh.net CNAME` |
| …and those are Cloudflare edge IPs | `104.21.84.37` ∈ `104.16.0.0/13`, `172.67.186.17` ∈ `172.64.0.0/13` | `curl -sS https://www.cloudflare.com/ips-v4` |
| …Cloudflare's *edge* certificate for `www` is already fine | the 530 arrives over a completed TLS handshake (`HTTP/2 530`, `alt-svc: h3`). The failure is entirely origin-side, so nothing about it is a certificate problem to chase | `curl -sS -D - https://www.hugmesh.net/` |
| GitHub Pages is **not** enabled here | `"private": true`, `"has_pages": false`; `GET /repos/hugmesh/hugmesh.github.io/pages` → `404 Not Found` | `gh api repos/hugmesh/hugmesh.github.io` |
| **…and the deploy pipeline is dead right now** | `Deploy Pages` last succeeded **2026-08-27T10:08Z** (run `33061712300`). Every run since — `33066072754`, `33073800663`, `33945745743`, and today's `35280630942` at 22:10Z — failed in 2-4 s with the job annotation *"The job was not started because recent account payments have failed or your spending limit needs to be increased"*. PR checks die the same way (`35286294059`, 1 s) | `gh run list --workflow "Deploy Pages"` ; `gh api repos/hugmesh/hugmesh.github.io/check-runs/<job-id>/annotations` |
| `hugmesh.github.io` answers, but with nothing | `185.199.108-111.153`, `2606:50c0:800{0,1,2,3}::153`; `HTTP/2 404` — *"There isn't a GitHub Pages site here"* | `curl -sS https://hugmesh.github.io/` |
| A Pages origin caches for 10 minutes | `cache-control: max-age=600` on the two `200`s I probed (HTML and JSON) on another Pages site. `hugmesh.github.io`'s own `404` carries **no** `cache-control` at all — re-measure on this site once it serves `200`s | `curl -sSI https://pages.github.com/` ; `curl -sSI https://pages.github.com/versions.json` ; `curl -sSI https://hugmesh.github.io/` |

Three things in that table are not just "nothing configured yet":

1. **`www.hugmesh.net` is live and failing right now, and the empty apex is the reason
   given for it.** Error 1016 is *"Origin DNS error"*: a **proxied** record exists whose
   origin hostname does not resolve. Anyone who types `www.hugmesh.net` today, over
   `https://` or plain `http://`, gets a Cloudflare error page, and has been getting one
   for as long as that record has pointed where it points. **Decision 47 is explicit that
   the `www` record change does not end this by itself** — verbatim: *"Note this does
   **not** fix today's HTTP 530 / error 1016 on its own — the apex still has no record at
   all."* That note is load-bearing precisely because it names something this runbook
   cannot measure: the proxy hides the record's target, so the origin hostname behind
   `www` is visible only in the operator's dashboard. Read with an apex that has no
   records at all, the operator's sentence describes the textbook shape of a 1016 — `www`
   proxied at an origin that is, or resolves through, an apex that does not exist — in
   which case **B1**, creating the apex, is what supplies the missing origin. So treat the
   1016 as a symptom of section **B as a whole**, not as something **B2** clears on its
   own; "What this step fixes, and what it does not" under B2 sets out exactly what a
   `www`-only change buys and what it does not.
2. **The apex is free, but the subdomain namespace is not.** The published docs in this
   repository already name `registry.`, `attestation.`, `id.`, `scale.`, `admin.`,
   `gitlab.`, `games.`, `vault.`, `platform.`, `matrix.`, `mastodon.` and `ai.`
   `.hugmesh.net` as mesh service hostnames
   (`grep -rhoaE '[A-Za-z0-9_-]+\.hugmesh\.net' content/ src/`). The docs site takes the
   **apex and `www` only**. Never create a wildcard — see step B3.
3. **Nothing can be published today even with perfect DNS, and the fix for that is not
   settled.** `Deploy Pages` has produced no artifact since 2026-08-27 (row above): the
   job is refused before it starts, on billing. Step **A2**, step **C1** and every check
   in step **G** assume a site that has actually been built and served — G item 1 expects
   `status: "built"`, which with Source = GitHub Actions only ever comes from a successful
   run. This collides with step **A1**. Decision **48 = B**, in the same operator comment
   that answers 47, chose a self-hosted `hugmesh-x86` runner and put the free tier
   *later*, "when the repos go public". A self-hosted runner changes where the **build**
   executes; it does not change whether GitHub will **host** Pages for a private
   repository, which is a plan entitlement, and `actions/deploy-pages` publishes to
   GitHub's Pages infrastructure whatever the runner label. So "make the repository
   public" is no longer a settled prerequisite — see **A1**, which now lists the three
   shapes this can take. **This runbook does not resolve it. It is an open operator
   decision and it gates everything from A2 onward.**

---

## What this repository already commits to

| Where | What it says |
|---|---|
| `src/CNAME:1` | `hugmesh.net` — the apex, shipped inside the Pages artifact. It is also what makes Pages issue the `www → apex` 301 for free (step **B2**) |
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

- **A1. Publication entitlement — OPEN, do not treat this as decided.** On the Free plan
  it is GitHub Pages *itself* — not merely the custom domain — that requires a public
  repository; the pre-existing prose at `.github/workflows/pages.yml:13` says "custom
  domains", which understates it. Making the repository public was this runbook's original
  answer, and it is still one of three: decision **48 = B** (2026-09-17, the same comment
  that answers 47) chose a self-hosted `hugmesh-x86` runner over going public and put the
  free tier "later, when the repos go public", while `Deploy Pages` itself has been dead
  on billing since 2026-08-27 (point 3 under "Where this stands"). The three shapes, one
  of which the operator has to pick before A2:
  1. **Make this repository public.** Pages and Actions both fall into the free tier.
     Verify: `gh api repos/hugmesh/hugmesh.github.io --jq .visibility` → `public`. This is
     what the rest of this runbook, `pages.yml:13` and `README.md` were written against.
  2. **Keep it private and restore paid billing** — raise the spending limit and hold a
     plan that includes Pages for private repositories. Nothing else in this file changes.
  3. **Keep it private, register the `hugmesh-x86` runner, and host the site off GitHub
     Pages.** That is a *different* runbook: `src/CNAME`, the CNAME assertion in
     `scripts/spa-fallback.mjs:47-53`, the `pages.yml` probe and the entire Cloudflare
     ordering below are all written against Pages, and steps B through G would need
     rewriting rather than adjusting.
  Registering a runner is operator-held and so is billing; no agent can do any of it.
- **A2. Settings → Pages → Source = "GitHub Actions".** The workflow deliberately does
  **not** call `actions/configure-pages` with `enablement: true`, because enabling
  publication silently is an operator decision (`pages.yml:103-107`, the comment above
  `id: probe`).
- **A3. Leave the custom domain blank for now.** Set it in step C, after DNS exists, so
  GitHub's DNS check passes on the first attempt instead of sitting in an error state.

## B. DNS in Cloudflare — **DNS only (grey cloud) at this stage**

The grey cloud is not optional here, and the reason is mechanical rather than a matter
of taste. A **proxied** record publishes Cloudflare's edge addresses, not the origin's —
that is exactly what the `www` rows in "Where this stands" show. GitHub's custom-domain
DNS check looks the name up and expects to see *GitHub's own* addresses; behind an orange
cloud it does not, the check fails, no Let's Encrypt certificate is ever requested, and
"Enforce HTTPS" stays greyed out with nothing to retry. Turning the proxy off while the
certificate is provisioned is GitHub's own documented requirement, not a local
superstition; nobody here has run it end to end, so expect to watch the Pages settings
page report a failed DNS check if a record is orange at this point. GitHub runs that
check and issues those certificates **per hostname**, so the apex and `www` pass or fail
independently.
Both records are therefore created DNS-only here and both go orange in step **D3**,
after the certificates exist.

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

**B2. `www` — decided: it is this site's alias.** This used to be an open question at the
bottom of this file. It is now answered: **decision 47 = (a)**, by the operator on
2026-09-17 ([the record](https://github.com/hugmesh/hugmesh-generator/issues/347#issuecomment-5722430270)).
`www.hugmesh.net` is the docs site's alias and nothing else is reserving it, so the
record that exists today is **edited in place** — change its target, do not add a second
record beside it, and do not delete-then-recreate; a second record, or a
delete-and-recreate, is how a zone ends up with two sources of truth for one name:

| Type | Name | Target | Proxy | TTL |
|---|---|---|---|---|
| `CNAME` | `www` | `hugmesh.github.io` | **DNS only** here and through step C; **Proxied** from **D3** | Auto |

**No Cloudflare redirect rule, Page Rule, Bulk Redirect or Worker is needed for
`www → apex`.** The Pages artifact ships a `CNAME` file naming the apex
(`src/CNAME:1`), and GitHub Pages issues the `www → https://hugmesh.net/` 301 off that
file by itself. A Cloudflare redirect on top would be a second, competing source of
truth for the same 301, and the first thing to suspect the day the redirect target is
wrong.

**What this step fixes, and what it does not.** Be precise, because "fix the 1016" and
"make `www` work" are not the same date — and decision 47 draws that line itself:

- **It is not a standalone fix for today's 1016. Decision 47 says so in terms**, in the
  same breath as choosing option (a): *"Note this does **not** fix today's HTTP 530 /
  error 1016 on its own — the apex still has no record at all."* Take that at face value.
  The operator can see the record's target in the dashboard; this runbook cannot (see
  "Where this stands"). Mechanically a 1016 is Cloudflare failing to resolve the *origin*
  behind a proxied name, so an apex with no records is a sufficient cause by itself, and
  **B1** is then what clears it. Retargeting `www` at `hugmesh.github.io` **DNS only**
  does stop a *Cloudflare* error page appearing, but only because grey cloud removes
  Cloudflare from the path entirely — there is no edge left to report anything — and what
  the visitor gets instead is the next bullet. **Do not apply B2 ahead of the rest of
  section B hoping to quietly end the 1016.** Run B1 and B2 together, in order, as part of
  go-live.
- **It does not make `www` serve the site.** Grey cloud takes Cloudflare *out* of the
  path, so the browser connects straight to GitHub Pages with `www.hugmesh.net` as SNI.
  Until C1-C2 have bound the custom domain and issued the certificates, GitHub has no
  certificate for that name, so `https://www.hugmesh.net/` fails on a certificate-name
  mismatch, and plain `http://` gets GitHub's *"There isn't a GitHub Pages site here"*
  404 (measured today against `hugmesh.github.io`). A visitor is no better served than
  they are by the 1016; the error has changed, not gone.
- **It does nothing whatsoever for the apex.** `hugmesh.net` is a separate record that
  still does not exist at all (re-measured 23:16Z); `curl https://hugmesh.net/` fails to
  *resolve*, which is **B1**'s job, not this one's. The two failures look unrelated to a
  visitor and they are.
- **`www` is only actually correct** — a `301` to the apex over a publicly trusted
  certificate — after **C2** (certificates issued), **C4**'s `www`-specific test, and
  **D3** (proxy on). Verification is item 5 in step G.

**Where this sits in the order, and why it must not move.** The record is created at
**B**, stays **DNS only** through **C**, and goes **Proxied** at **D3** — the same
sequence the apex follows, for the same reason given in the B preamble above: a proxied
`www` resolves to Cloudflare edge addresses, GitHub's per-hostname DNS check does not
find GitHub's addresses there, and the `www` certificate is never issued. So `www` must
not be flipped orange early to "fix" the 1016 faster; flipping it orange before its
certificate exists is what would strand it. It goes orange only after **C4**'s `www`
`--resolve` test returns a `301` over a valid certificate. If that test still fails,
leave `www` grey and flip only the apex in D3 — nothing else in this runbook depends on
`www` being proxied.

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

  Run the **same test for `www`** before D3 proxies it — `www` is a real alias of this
  site (**B2**, decision 47 = (a)), not an optional extra — because Full (strict)
  validates the origin certificate per hostname and GitHub issues a separate certificate
  for the `www` variant:

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
- **D3.** Flip the apex and `www` records from DNS-only to **Proxied**. This is the only
  step that changes `www`'s proxy status after B2 created it grey, and it is gated on
  C4's `www` test passing — flip the two records independently if only one is ready.
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
# expect: 301 -> https://hugmesh.net/, issued by GitHub Pages off src/CNAME (B2) and NOT
#         by any Cloudflare rule. Today: HTTP 530 / error 1016, on http:// and https://
#         alike. Re-run the same probe against http:// too — the 1016 answers both.
curl -s -H 'accept: application/dns-json' \
  'https://cloudflare-dns.com/dns-query?name=www.hugmesh.net&type=A'; echo
# expect: after D3, Cloudflare edge addresses again, but now with a live origin behind
#         them. Between B2 and D3 (grey cloud) it answers GitHub's 185.199.10{8,9,10,11}
#         .153 instead — that difference is how you tell which stage the zone is in.

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
#           curl -s -H 'accept: application/dns-json' \
#             'https://cloudflare-dns.com/dns-query?name=*.hugmesh.net&type=A'
#         which must be NOERROR/NODATA.
```

The issue can be closed when (1) reports `cname: hugmesh.net` with
`https_enforced: true` and `status: built`, and (2) through (6) match. **None of that is
reachable while `Deploy Pages` cannot start** — with Source = GitHub Actions,
`status: "built"` comes only from a successful run, and there has not been one since
2026-08-27 (point 3 under "Where this stands", and step **A1**). Perfect DNS in front of a
site that was never published still answers nothing. Nothing an agent can run from a build
box moves any of this: every remaining action is inside the operator's Cloudflare
dashboard, this repository's settings, and the account's billing or runner configuration.

