---
title: "hugmesh-login-ui"
section: "reference"
slug: "login-ui"
summary: "The login and account-security remote owning sign-in, two-stage registration, MFA and the ban and suspension surfaces."
source_repo: "hugmesh-login-ui"
source_path: "README.md"
source_ref: "35a8be5"
---

The login and account-security surface for [HugMesh](https://github.com/hugmesh). It is an Angular
22 [native-federation](https://www.npmjs.com/package/@angular-architects/native-federation) remote
that owns sign-in, two-stage registration, MFA, and the ban/suspension appeal flow.

## Highlights

- **Native username/password sign-in, no OAuth redirect.** The browser never sees a Casdoor URL or
  a raw token. This remote POSTs credentials to the backend. The backend drives the
  identity-provider exchange server-side and hands back only an opaque, httpOnly session cookie. A
  unit guard (`src/app/no-casdoor-origin.spec.ts`) fails if the source grows a way to build an
  identity-provider URL.
- **Inline MFA.** TOTP and WebAuthn passkey enrollment, step-up challenges, and a self-service
  security page, all served from this remote.
- **Two-stage registration.** A first-time sign-in captures a display name before backend-provisioned
  service tokens unlock the rest of the platform. A non-ASCII name also needs an accessible
  screen-reader name.
- **Passwordless local sign-in.** On load, this remote may probe a local agent on the same machine
  (loopback only, never a network probe). If the agent answers, the page offers a one-click role
  picker instead of the password form. If it is absent or fails, the normal form shows and nothing
  else changes.
- **Runtime theming, build-time catalogs.** Brand colors and fonts are injected at container start,
  not baked into the build, so one image serves every brand. Which translation catalogs ship is
  decided at image build (`HUG_WEB_LOCALES`, see `src/locale/README.md`). Which one a browser loads
  is decided at runtime.
- **Theme-reactive animated background.** A WebGL backdrop reads its colors from the same runtime
  theme tokens as the rest of the page, so a rebrand restyles it live. See below.
- **Accessibility first.** WCAG-audited color tokens, a two-layer high-contrast focus ring,
  live-region announcements, and a 44px minimum touch target on touch screens (`pointer: coarse`)
  are in the base styling, not an add-on.

## Login background

The sign-in page paints a themed backdrop in layers:

1. a CSS gradient built from the `--hug-*` tokens,
2. optionally a [Vanta](https://www.vantajs.com/) effect or an operator-supplied image over it,
3. the pride-flag stripes, when the active theme preset carries them,
4. a scrim of `--hug-bg-0` over all of it.

The scrim keeps the form legible. Text is composited back toward the color the `--hug-text*` tokens
were derived against, so no effect can break contrast (`worstCaseTextContrast()` asserts the bound).

**The background is decoration. It never decides whether someone can sign in.** Layer 1 is CSS and
is on screen before any script runs. No WebGL, a chunk that will not load, a Vanta init that
throws, a lost GL context, an image that will not decode: each lands back on that gradient. A
preset id that is not in the list is ignored, and the next rung of the precedence ladder below
applies. The page is never blank.

`prefers-reduced-motion: reduce` means the effect is **never started**. It is not started and
paused. The animation chunks are not even fetched. The preference is watched, not read once, so
flipping it mid-session stops the animation.

### Presets

| id       | what it is                                                    |
| -------- | ------------------------------------------------------------- |
| `fog`    | slow gradient wash — the default; one full-screen shader, no geometry |
| `waves`  | a lit, rolling surface                                        |
| `net`    | connected points — the platform's own metaphor                |
| `globe`  | a rotating point-globe                                        |
| `static` | the themed CSS gradient alone: no WebGL, no chunk, no motion   |
| `image`  | an operator-supplied background file                          |

Vanta's `birds`, `dots` and the rest are left out on purpose. They call three.js APIs removed years
ago. Vanta catches the error internally and renders a flat color, so the option would look shipped
and not work.

### Configuration

Env vars, read at container start by `docker-entrypoint.d/40-snap-config.sh`. The contract is the
same as the theme's: a change is an env edit plus a restart, never an image rebuild.

| variable            | meaning                                                                   |
| ------------------- | ------------------------------------------------------------------------- |
| `SNAP_BG_EFFECT`    | one of the preset ids above. Unset ⇒ the theme's `--sd-bg-effect` (next section); with no theme value, `image` if an image is configured, else `fog` |
| `SNAP_BG_IMAGE_URL` | the operator's own background file (see below)                            |
| `SNAP_BG_PICKER`    | `1`/`true`/`yes`/`on` shows a visitor-facing preset picker. Off by default — the front door carries no decoration controls unless asked |

Anything unrecognised is ignored, not fatal. An unknown effect id falls to the next default. An
unusable image falls to the themed gradient. The allowlists live in `src/app/background.types.ts`
(unit-tested) and are deliberately **not** duplicated in shell.

### Theme-declared effect: `--sd-bg-effect`

The theme can declare the background effect itself. It rides the same `HUG_THEME_CSS` transport as
the colors (`docker-entrypoint.d/50-hug-theme.sh`; `SNAP_THEME_CSS` is still read as a fallback).
Picking an effect in the generator's Themes editor therefore needs no per-service env.
**The contract** is shared with [hugmesh-host-shell#19](https://github.com/hugmesh/hugmesh-host-shell/issues/19).
host-shell PR #20 delivered the first half of that issue.

```css
:root {
  --sd-bg-effect: vanta-fog; /* 'gradient' (default) | 'none' | 'vanta-<name>' */
}
```

| value          | meaning                                                                    |
| -------------- | -------------------------------------------------------------------------- |
| `gradient`     | the theme's plain background — the **default**, and what every unknown value degrades to |
| `none`         | no animated effect. Renders the same as `gradient` here: this page's static layer *is* a themed gradient |
| `vanta-<name>` | one of the bundled effects: `vanta-fog`, `vanta-waves`, `vanta-net`, `vanta-globe` |

Consumers **must parse tolerantly** (case, whitespace, optional quotes). They **must treat any
unknown or unbundled value as `gradient`**. A theme that names `vanta-birds`, or an effect a later
build bundles and this one does not, gets a clean themed page, not a boot failure or a dead
rectangle. That keeps the token forward-compatible: the generator can grow the vocabulary before any
consumer ships. The generator's `css_root` also emits the token's runtime twin `--hug-bg-effect`.
This repo reads `--sd-bg-effect` first and the twin second.

Precedence, most specific first. The background image uses the same ladder.

1. the visitor's own pick (only while `SNAP_BG_PICKER` is on),
2. `SNAP_BG_EFFECT` — this deployment's explicit env override,
3. `--sd-bg-effect` — the mesh's brand default, re-read on every theme change. A switch destroys
   the running Vanta instance before it starts the next, because an undestroyed instance leaks its
   WebGL context,
4. `image` if a background file is configured, else `fog`.

`gradient` and `none` govern the **animation axis only**. They do not suppress a configured
background image: a theme that says "no animation" has not said "no picture". The generator emits
`--sd-bg-effect` only when the effect is not `gradient`. A `vanta-<name>` is an explicit choice and
covers the image, like an explicit `SNAP_BG_EFFECT`. `prefers-reduced-motion` outranks everything
on this list: the effect is never started and its chunks are never fetched.

### Bringing your own background file

An operator background is a **themeable asset**, not an upload. This repo has no upload endpoint.
The platform already ships operator-supplied art (brand fonts) by embedding it in the same theme
CSS text the colors ride on, and a background image takes that route too. Supply it either way:

- `SNAP_BG_IMAGE_URL` — this deployment's explicit override; or
- `--hug-login-bg-image: url("…")` in the theme CSS — the mesh's brand default.

Env wins over the token. Accepted: an `https:` URL, a same-origin path, or a base64 `data:` URI of
a **raster** image (PNG/JPEG/WEBP/AVIF/GIF). That is a strict subset of what nginx's `img-src` CSP
allows. SVG is rejected, as the platform already does for operator art (the avatar path refuses it
too): an SVG is a document that can carry script, and this one paints on the login page. `http:`
(a mixed-content downgrade), protocol-relative URLs and every CSS `url()` breakout character are
rejected outright, not escaped. The image is then decoded and must be at least 320×240 pixels
before it is painted, because a string check cannot tell a photograph from a 1×1 tracking pixel.

### Bundle cost

`three` and `vanta` are real npm dependencies, bundled locally. The gateway's nonce-CSP blocks
external hosts, so a CDN `<script>` cannot work here. Both stay off the critical path: they load
only through dynamic `import()`, and `federation.config.js` skips them from the shared federation
surface so esbuild's code splitting stays in charge. Measured against the same build at the
previous commit:

| chunk                        | raw       | transfer  |
| ---------------------------- | --------- | --------- |
| initial total (before)       | 131.21 kB | 40.46 kB  |
| initial total (after)        | 131.43 kB | 40.11 kB  |
| boot chunk (before → after)  | 131.37 → 142.70 kB | 26.56 → 29.10 kB |
| `three` (lazy)               | 734.97 kB | 154.04 kB |
| each effect (lazy)           | ~12–15 kB | ~4 kB     |

The bottom two rows are not fetched until an effect is about to run. A reduced-motion visitor, a
machine without WebGL, and the `static` and `image` presets pay nothing for them.

That table is the cost of the background when it landed. A build on 2026-10-07 gives, for the
initial total, 131.43 kB raw / 40.09 kB transfer. The `three` chunk is 734.97 kB / 154.10 kB, and
each effect is 11.82–14.49 kB / 3.61–4.35 kB. The boot chunk (now named `bootstrap`) has grown to
190.40 kB / 33.77 kB.

## What this remote publishes

It is a native-federation **remote** named `login`. It exposes two modules.

| exposed module  | what it is                                                        | who loads it |
| --------------- | ----------------------------------------------------------------- | ------------ |
| `./routes`      | the login / registration / forgot-password / appeal / MFA routes, mounted at `/login` | hugmesh-host-shell |
| `./mfa-step-up` | the MFA step-up challenge, rendered **in place** by another remote | intended for forum, mod, wiki; no repo loads it yet |

`npm run federation:check` is the build gate over both. It fails on:

- a missing or renamed expose,
- an exposed entry that never installs `$localize`,
- an exposed entry that is not a TypeScript program root,
- a remote name that disagrees with what this repo publishes,
- and, anywhere in the **embedded** module's graph: an `@angular/router` import, a `routerLink` in
  any template (linked **or inline**), an absolute `href`, or a raw navigation primitive
  (`location.href =`, `location.assign/replace`, `window.open`, `history.pushState/replaceState`).
  A router is not the only way to move a page.

`npm run mirror:check` is the second build gate (`tools/fleet-mirror/census.mjs --self`,
hugmesh-login-ui #18). This remote is the only one that creates `localStorage['hug.session']` at
sign-in. Fourteen production files in other repositories still load their whole session from it.
Delete the write before they migrate and every role-home is signed out right after a successful
sign-in. PR #17 did that, and PR #19 put the write back.

hugmesh-host-shell also touches the key. It patches `status` into an existing session and removes
the key on sign-out. `tools/fleet-mirror/readers.json` lists that file as a second writer.

The gate fails when the comment-stripped `src/app/session.service.ts` has no `setItem` of the key,
or has one in a function nothing calls, while `tools/fleet-mirror/readers.json` still lists a
blocking reader. It reads two files and spawns nothing, so it also runs in the image build.
`npm run mirror:census` is the full cross-repo census and needs the sibling checkouts.
`npm run mirror:test` is the guard's own mutation battery.

**Both gates are wired into `pretest` and `prebuild`, not just the Dockerfile, and that matters.**
The federation gate is the *only* enforcement of the router-free contract. A unit spec cannot see
the break: Angular's `Router` is root-providable, so `inject(Router)` resolves in a TestBed with no
`provideRouter` and throws nothing. Measured: with the gate reachable only from `build:image`, a
component that re-acquired a `Router` and called `router.navigateByUrl('/login/security')` on the
success path gave `TOTAL: 467 SUCCESS` from `ng test` and a clean `ng build`. With the hooks in
place the same mutation fails `npm test` and `npm run build` with `[C] … imports '@angular/router'`.

`mirror:check` needs the hooks for a different reason. `build:image` runs only on
`$CI_DEFAULT_BRANCH` and on tags (`.gitlab-ci.yml`). With the check reachable only from there, a
pull request shaped like PR #17 would merge green, and the guard would first fire in the post-merge
image build, after the regression is on `main`. `tools/fleet-mirror/census.test.mjs` pins the
`pretest`/`prebuild` wiring so nobody can remove it silently. Do not unwire them. GitHub Actions
(`.github/workflows/ci.yml`, #22) also runs the gates on every pull request, in its own `gates` job.

### The federated MFA step-up challenge (`./mfa-step-up`)

There used to be three copies of this one client: this remote's `/login/mfa/challenge` page,
admin-ui's inline dialog, and service-catalog-ui's paste-a-token variant. Forum, mod and wiki each
needed a fourth. hugmesh-generator#347 decision 21 settled it: **login-ui federates one dialog.**
The class the routed page renders is the class this module hands out. There is no second
implementation to drift.

```ts
import { loadRemoteModule } from '@angular-architects/native-federation';

const m = await loadRemoteModule({
  remoteEntry: '/login/remoteEntry.json',   // NOT the two-arg overload — see below
  remoteName: 'login',
  exposedModule: './mfa-step-up',
});

const Cmp = await m.loadMfaStepUpComponent();      // awaits this remote's catalog
const ref = viewContainerRef.createComponent(Cmp);
ref.setInput('action', 'lock this topic');          // optional

ref.instance.satisfied.subscribe(() => { retryTheGatedAction(); ref.destroy(); });
ref.instance.dismissed.subscribe(() => ref.destroy());
ref.instance.unavailable.subscribe(() => { ref.destroy(); showYourOwnFallback(); });
```

**Pass `remoteEntry`.** The host shell initialises federation with an empty eager set
(`EAGER_REMOTES = []`) and parks every remote for on-demand loading. Unless the user has already
been to `/login` this session, `loadRemoteModule('login', './mfa-step-up')` finds nothing
registered. The object overload initialises the remote first.

**Prefer `loadMfaStepUpComponent()` to the bare `MfaStepUpComponent` export.** It awaits this
remote's translation catalog before it returns the class. An embedded dialog has no other hook for
that: the `./routes` tree loads the catalog in a `canMatch` guard, and a dialog has no router. The
bare class renders fine, in English.

**What the outputs mean.**

- `satisfied`: the caller's own session now carries a fresh `mfa_satisfied` stamp server-side.
  Retry the same action unchanged. Nothing is handed back, because the BFF gates read the stamp off
  the session, not off a value a dialog could return.
- `dismissed`: the user pressed "Not now". Do not retry.
- `unavailable`: the MFA surface answered 503 because it ships dark platform-wide. It is emitted at
  most once. In that state the dialog offers no way out, because what "back" means belongs to the
  surface that embedded it.

**What the consumer must provide:**

- `provideHttpClient()` in its root injector. The generated `/bff/mfa/*` client is
  `providedIn: 'root'`. Credentials ride on a per-request `HttpContext` token, not an interceptor,
  so the client works under someone else's `HttpClient`.
- `globalThis.__HUG_BFF_URL__`, **only if the BFF is not same-origin**. It is read at module scope
  and defaults to `''`, which makes every call root-relative (`/bff/mfa/challenge`). That is the
  working path under the host shell, where nothing sets the global today.
- the `--hug-*` theme custom properties on the page. The host shell defines all eight this surface
  uses, and so do forum-ui, mod-ui and wiki-ui standalone.
- a CSP that admits this remote's same-origin chunks, plus the `blob:` that es-module-shims needs in
  `script-src`/`style-src`/`connect-src`.

**It is not reachable yet, and that is why it could land.** MFA ships dark org-wide
(`app.mfa.enabled=false` / `app.casdoor.mfa.enabled=false`). Every `/bff/mfa/*` call answers 503,
so this dialog can only reach `unavailable`. No other repo loads the module yet: forum-ui and
wiki-ui do not reference it, and mod-ui and admin-ui carry their own `MfaStepUpDialogComponent`.
The forum BFF now marks a step-up refusal on the wire (403 plus `X-Step-Up-Required: X-Forum-StepUp`,
hugmesh-forum-bff-api#15, fixed in PR #17), so a consumer can tell it from a role 403.

## Develop

```sh
npm install
npm start        # serves the remote standalone on http://localhost:4203
npm test         # unit tests (Karma + JUnit report)
```

### End-to-end tests

```sh
cd e2e && npm install
npm run bdd       # Playwright + Gherkin (playwright-bdd)
```

### Typed API client

The Angular client under `src/app/api/` is generated from a committed OpenAPI spec
(`openapi.json`), so builds are deterministic and need no network access:

```sh
npm run gen       # regenerate from openapi.json
```

## Build & deploy

```sh
npm run build     # -> dist/login/browser
npm run build:image
```

The Dockerfile builds the bundle on Node 24 and serves it from nginx 1.27. nginx sends a
nonce-based CSP and baseline security headers (`X-Frame-Options`, `Strict-Transport-Security`,
etc.), and falls back to `index.html` for SPA routes. Per-brand theming and the background settings
come from environment variables at container start; see `docker-entrypoint.d/` for the mechanism.
The set of locale catalogs is the exception. It is a build argument: `HUG_WEB_LOCALES`, or the older
`SNAP_WEB_LOCALES`.

### What goes into the image (`.dockerignore`)

The Dockerfile installs from `package-lock.json` and only then runs `COPY . .`. Without an ignore
list, that `COPY` puts the developer's own `node_modules` **on top of** the tree `npm install` just
resolved. The image is then built from whatever was on that disk. It still builds, which is why the
failure hides. `.dockerignore` prevents it (#21). The header of that file records the
hugmesh-host-shell incident that produced the same file there.

```sh
npm run docker:context           # what the image would contain, and what it must not lose
npm run docker:context -- --list # the full context file list
npm run docker:test              # the .dockerignore matching rules this depends on
```

`docker:context` runs automatically from `pretest`, `prebuild` and `build:image`. It lists the build
context under Docker's own matching rules (`tools/docker/dockerignore.mjs`, a port of
moby/patternmatcher) and fails in **both** directions: if an installed or derived tree is still in
the context, and if an over-broad ignore line has dropped a path the image build reads. The scope
rule makes the naive fix wrong. A `.dockerignore` pattern is matched against the whole relative
path, so a bare `node_modules` line would exclude only the root one and leave `e2e/node_modules` in
the image.

**`docker:context` alone cannot pin that scope rule.** It lists whatever the checkout has on disk.
A normal developer checkout grows only a *root* `node_modules`, unless `e2e/` has its own install.
So narrowing `**/node_modules` back to `node_modules` still exits 0 against a typical tree, even
though it reopens #21 for anyone whose `e2e/` has an install. `docker:test` pins the rule with a
synthetic path (the `'this repo HAS a .dockerignore...'` case in `context.test.mjs`), whatever
exists on the machine that runs the check. `docker:test` therefore also runs from `pretest` and
`prebuild`, next to `docker:context`. A regression to the narrower pattern turns the test suite red
instead of merging silently.

Measured on a checkout that has `node_modules` (`--context <dir>`, 2026-10-07): 37 483 files /
3 244.4 MiB with no `.dockerignore` (`--no-ignore`), 538 files / 2.7 MiB with it.

### Versions and published images

The version lives in `package.json` (and the matching root entries of `package-lock.json`). It is
`MAJOR.MINOR.PATCH-beta.N` while the remote is in beta: today `0.3.0-beta.1`, where 0.3 means it
runs in the default mesh and the sign-in path has been checked live. A fix during the beta raises
`N`; a step up the status ladder raises MINOR and resets `N` to 1.

`.github/workflows/release.yml` publishes `ghcr.io/hugmesh/hugmesh-login-ui`:

| Trigger | Image tags | GitHub release |
|---|---|---|
| push to `main` | `main`, `sha-<12 hex>` | none |
| push of tag `v<version>` | `<version>`, `beta`, `sha-<12 hex>` | prerelease, never marked latest |
| manual run on `main` | same as a push to `main` | none |
| manual run on a `v*` tag | re-runs that release; what already exists is left alone | same |

`latest` is never pushed for a beta. The tag must equal `v` plus the `package.json` version and
point at a commit on `main`, and a version that is already in the registry is never overwritten.
Before the image is built, the workflow runs the same gates and Karma suite as `ci.yml`. The
workflow has no pull-request trigger. Its jobs use the self-hosted runner only when the repository
variable `RUNS_ON_PUBLISH` is set and the run is for `main` or a `v*` tag; otherwise they run on
`ubuntu-latest`. To cut a beta, merge the version bump, then push an annotated tag on that commit:

```sh
git tag -a v0.3.0-beta.1 -m "hugmesh-login-ui 0.3.0-beta.1" <merge commit>
git push origin v0.3.0-beta.1
```

## Roadmap

These are plans, not features.

- Move the session-owning login/registration handshake fully onto the shared auth library, so the
  identity-provider integration lives in one place.
- Move the remaining credentialed API calls onto the generated typed client. The anonymous/public
  reads are already moved.

## License

MIT — see [LICENSE](LICENSE).
