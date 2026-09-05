---
title: "hugmesh-login-ui"
section: "reference"
slug: "login-ui"
summary: "The login and account-security remote owning sign-in, two-stage registration, MFA and the ban and suspension surfaces."
source_repo: "hugmesh-login-ui"
source_path: "README.md"
source_ref: "hugmesh/hugmesh-login-ui@HEAD"
---

The login and account-security surface for [HugMesh](https://github.com/hugmesh) — an Angular
22 [native-federation](https://www.npmjs.com/package/@angular-architects/native-federation) remote
that owns sign-in, two-stage registration, MFA, and the ban/suspension appeal flow.

## Highlights

- **Native username/password sign-in, no OAuth redirect.** The browser never sees a Casdoor URL or
  a raw token. This remote POSTs credentials to the backend, which drives the identity-provider
  exchange server-side and hands back only an opaque, httpOnly session cookie. A build-time check
  (plus a unit guard) asserts the shipped bundle references no identity-provider origin at all.
- **Inline MFA.** TOTP + WebAuthn passkey enrollment, step-up challenges, and a self-service
  security page, all served from this remote.
- **Two-stage registration.** A first-time sign-in captures a display name (and, for non-ASCII
  names, a required accessible screen-reader name) before backend-provisioned service tokens
  unlock the rest of the platform.
- **Passwordless local sign-in.** On load, this remote optionally probes a local agent running on
  the same machine (loopback-only, never a network probe); if present, it offers a one-click
  role picker instead of the password form. Fully additive — absent or failing silently falls back
  to the normal form.
- **Runtime theming and i18n.** Brand colors/fonts and translation catalogs are injected at
  container start, not baked into the build — one image serves every deployment.
- **Theme-reactive animated background.** A WebGL backdrop whose colors are read from the same
  runtime theme tokens as the rest of the page, so a rebrand restyles it live. See below.
- **Accessibility-first.** WCAG-audited color tokens, a two-layer high-contrast focus ring,
  live-region announcements, and ≥44px touch targets are part of the base styling, not an add-on.

## Login background

The sign-in page paints a themed backdrop in three layers: a CSS gradient built from the
`--hug-*` tokens, optionally a [Vanta](https://www.vantajs.com/) effect or an operator-supplied
image drawn over it, and a scrim of `--hug-bg-0` over both. The scrim is what keeps the form
legible: text is composited back toward the very color the `--hug-text*` tokens were derived
against, so no effect can quietly break contrast (`worstCaseTextContrast()` asserts the bound).

**It is decoration, and it never gets a vote on whether someone can sign in.** Layer 1 is CSS and
is on screen before any script runs. No WebGL, a chunk that will not load, a Vanta init that
throws, a lost GL context, an image that will not decode, a typo'd preset id — every one of them
lands back on that gradient. There is no state in which the page is blank.

`prefers-reduced-motion: reduce` means the effect is **never started** — not started and paused —
and the animation chunks are not even fetched. The preference is watched, not read once, so
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

Vanta's `birds`, `dots` and friends are deliberately absent: they call three.js APIs removed years
ago, and Vanta catches that internally and renders a flat color — a shipped option that looks like
it works and doesn't.

### Configuration

Env vars, read at container start by `docker-entrypoint.d/40-snap-config.sh` — same contract as the
theme, so a change is an env edit plus a restart, never an image rebuild:

| variable            | meaning                                                                   |
| ------------------- | ------------------------------------------------------------------------- |
| `SNAP_BG_EFFECT`    | one of the preset ids above. Unset ⇒ `image` if an image is configured, else `fog` |
| `SNAP_BG_IMAGE_URL` | the operator's own background file (see below)                            |
| `SNAP_BG_PICKER`    | `1`/`true` shows a visitor-facing preset picker. Off by default — the front door carries no decoration controls unless asked |

Anything unrecognised falls back to the themed gradient rather than failing the page; the
allowlists live in `src/app/background.types.ts` (unit-tested) and are deliberately **not**
duplicated in shell.

### Theme-declared effect: `--sd-bg-effect`

The theme itself can declare the background effect — the same `SNAP_THEME_CSS` transport the
colors ride on, so picking an effect in the generator's Themes editor needs no per-service env.
**The contract** (shared with [hugmesh-host-shell#19](https://github.com/hugmesh/hugmesh-host-shell/issues/19);
host-shell PR #20 standardized the `--sd-*` token namespace it lives in):

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

Consumers **must parse tolerantly** (case, whitespace, optional quotes) and **must treat any
unknown or unbundled value as `gradient`** — a theme naming `vanta-birds`, or an effect a future
build bundles and this one does not, gets a clean themed page instead of a boot failure or a dead
rectangle. That is what makes the token forward-compatible: the generator can grow the vocabulary
without any consumer shipping first. The generator's `css_root` also emits the token's runtime
twin `--hug-bg-effect`; this repo reads `--sd-bg-effect` first and the twin second.

Precedence, most specific wins — the same ladder the background image uses:

1. the visitor's own pick (only while `SNAP_BG_PICKER` is on),
2. `SNAP_BG_EFFECT` — this deployment's explicit env override,
3. `--sd-bg-effect` — the mesh's brand default, re-read on every theme change (a switch destroys
   the running Vanta instance before starting the next; an undestroyed instance leaks its WebGL
   context),
4. `image` if a background file is configured, else `fog`.

`gradient`/`none` govern the **animation axis only**: they do not suppress a configured
background image (the generator emits the field's default for every theme, so letting it beat the
image would silently un-configure every image-shipping mesh). A `vanta-<name>` is an explicit
choice and covers the image, exactly like an explicit `SNAP_BG_EFFECT`. `prefers-reduced-motion`
outranks everything on this list: the effect is never started and its chunks are never fetched.

### Bringing your own background file

An operator background is a **themeable asset**, not an upload: there is no upload endpoint in this
repo, and the platform already ships operator-supplied art (brand fonts) by embedding it in the
same `SNAP_THEME_CSS` text the colors ride on. A background image gets the same transport rather
than a new one. Supply it either way:

- `SNAP_BG_IMAGE_URL` — this deployment's explicit override; or
- `--hug-login-bg-image: url("…")` in `SNAP_THEME_CSS` — the mesh's brand default.

Env wins over the token. Accepted: an `https:` URL, a same-origin path, or a base64 `data:` URI of
a **raster** image (PNG/JPEG/WEBP/AVIF/GIF) — a strict subset of what nginx's `img-src` CSP allows.
SVG is rejected, matching the platform's existing stance on operator art (the avatar path refuses
it too): an SVG is a document that can carry script, and this one paints on the login page. `http:`
(a mixed-content downgrade), protocol-relative URLs and every CSS `url()` breakout character are
rejected outright rather than escaped. The bytes are then decoded and size-checked before being
painted, because a string check cannot tell a photograph from a 1×1 tracking pixel.

### Bundle cost

`three` and `vanta` are real npm dependencies bundled locally — the gateway's nonce-CSP blocks
external hosts, so a CDN `<script>` cannot work here. They are kept off the critical path: both are
reached only through dynamic `import()`, and `federation.config.js` skips them from the shared
federation surface so esbuild's code splitting stays in charge. Measured against the same build at
the previous commit:

| chunk                        | raw       | transfer  |
| ---------------------------- | --------- | --------- |
| initial total (before)       | 131.21 kB | 40.46 kB  |
| initial total (after)        | 131.43 kB | 40.11 kB  |
| boot chunk (before → after)  | 131.37 → 142.70 kB | 26.56 → 29.10 kB |
| `three` (lazy)               | 734.97 kB | 154.04 kB |
| each effect (lazy)           | ~12–15 kB | ~4 kB     |

Nothing in the bottom two rows is fetched until an effect is actually about to run — so a
reduced-motion visitor, a machine without WebGL, and the `static`/`image` presets all pay zero.

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

The Dockerfile builds a Node-based image and serves the compiled bundle via nginx, with baseline
security headers (`X-Frame-Options`, `Strict-Transport-Security`, etc.) and an SPA fallback route.
Per-brand theming and locale catalogs are supplied at container start via environment variables —
see `docker-entrypoint.d/` for the exact mechanism.

## Roadmap

- Migrate the session-owning login/registration handshake fully onto the shared auth library so
  the identity-provider integration is centralized in one place.
- Move remaining credentialed API calls onto the generated typed client (the anonymous/public reads
  are already migrated).
- Add end-to-end coverage for the passwordless local-sign-in flow (currently unit-tested only).

## License

MIT — see [LICENSE](LICENSE).
