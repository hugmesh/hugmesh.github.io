---
title: "hugmesh-owncast-ui — e2e (Playwright + playwright-bdd)"
section: "developer-guide"
slug: "owncast-ui-e2e"
summary: "The Gherkin-driven Playwright harness for the owncast-ui federated remote."
source_repo: "hugmesh-owncast-ui"
source_path: "e2e/README.md"
source_ref: "27d94c0"
---

Gherkin-driven end-to-end harness for the owncast-ui federated remote. It
follows the `hugmesh.games/e2e` pattern: `@playwright/test` + `playwright-bdd`,
one worker, serial, `screenshot:'on'` and `video:'on'`, an HTML reporter, and a
per-step PNG `AfterStep` hook in `features/support/fixtures.ts`.

The owncast-ui is the UI half of the **optional Owncast streaming service**, so
the suite starts with who may broadcast. A user controls their **own** stream
visibility. An admin or superadmin gates whether a stream may broadcast. A mod
moderates. Every part a role cannot use is hidden or forbidden.

| Class | Feature file | What it asserts |
| --- | --- | --- |
| USER-SITUATIONAL | `features/stream/my-stream.feature` | a streamer controls their own stream (ALLOW); the public-visibility option is **disabled + the broadcast-gate helptext** until an admin grants broadcast; no-role → in-remote forbidden (DENY) |
| USER-SITUATIONAL | `features/stream/superadmin-exemption.feature` | the UI fail-closed-disables public even for a superadmin, and the **Try going public probe succeeds grant-free** (the bff's documented SUPERADMIN guard exemption) |
| USER-SITUATIONAL | `features/gating/role-aware-nav.feature` | each role sees only the nav items it can use; a user with no owncast role sees **no nav at all** (the menubar is not rendered; greyed-out / no access) |
| MULTIUSER | `features/grants/broadcast-grants.feature` | admin sees the grant action form; the active-grants + history panels are **superadmin-only**; mod/streamer → forbidden (DENY) |
| MULTIUSER | `features/grants/grant-to-public-lifecycle.feature` | **the core journey**: streamer creates their stream (victim-creates-first), is denied live, admin grants, the streamer's next try-public **succeeds mid-session** and the UI leaves the fail-closed state |
| MULTIUSER | `features/grants/revocation-mid-session.feature` | removing the grant flips the streamer back to fail-closed on the next attempt; **ban beats a still-active grant** from the victim's perspective |
| MULTIUSER | `features/grants/grants-form-and-history.feature` | client-side validation (exact inline errors + aria-invalid, no result); grant→ban→restore leaves an **audit trail** the superadmin history shows (active AND revoked rows) |
| MULTIUSER | `features/moderation/moderation.feature` | mod/admin reach the feed; a mod **hides** a genuinely-public stream and the victim's own console reflects the forced flip; streamer/user → forbidden (DENY) |
| MULTIUSER | `features/moderation/kill-restore-lifecycle.feature` | **Kill** (confirm dialog asserted by exact message) bans + forces internal — Banned badge, disabled+helptext Kill, victim denied even while granted; **Restore** lifts the ban and the original grant re-admits; a dismissed confirm fires nothing |
| MULTIUSER | `features/moderation/domain-scope-visibility.feature` | *multi-brand stack only*: moderation lists are brand-pinned (mod-a never sees brand B's stream) while the superadmin active-grants list spans brands |
| CROSS-USER | `features/gating/cross-user-isolation.feature` | with **real authenticated sessions** the owncast-bff returns exactly 403 (not an anonymous 401) to a streamer self-grant, a mod manage-write, a streamer mod-read, a no-role streamer-read and a plain-admin superadmin read — against the real openapi.json paths with well-formed bodies; the superadmin 200 is the ALLOW counterexample; anonymous → 401/403 |
| A11Y | `features/a11y/accessibility.feature` | skip-link → focus `#owncast-main`, `role="menubar"` named nav, roving tabindex + Arrow-key nav, each view region named, forbidden screen `role="alert"` |

**Session honesty split** (held across the suite). `signs in with a real Casdoor
session` (full login, HttpOnly `bff_` cookie, isolated context per user) is for
every scenario that does a real write or asserts a real BFF response. `has a
seeded session` (localStorage only, **no** BFF cookie, so every /bff fetch would
be anonymous) is for pure client-side behaviour only: guard redirects, role-aware
nav, a11y contracts, and form validation that never sends a request. Live
scenarios set their own starting state (idempotent revokes and an own-visibility
reset) instead of assuming an empty database, and every notice or error is
asserted by exact text.

The owncast role model mirrors `hugmesh-owncast-bff-api` SecurityConfig:
`STREAM = ROLE_OWNCAST`, `MANAGE = ADMIN|SUPERADMIN`, `MANAGE-ALL = SUPERADMIN`
(the list-active and history reads), `MODERATE = MOD|ADMIN|SUPERADMIN`. A denied
child route goes to the **in-remote** `/owncast/forbidden` screen (NOT `/login`,
NOT `/forbidden`). The host already let the user into the `/owncast` mount, so a
denial here is a privilege boundary inside the service.

## Ships dark (wave 2b)

Every scenario that needs a live stack (host shell serving the remote,
owncast-bff and a Casdoor seed) is tagged **`@cluster`** at the feature level.
The default config filters them out (`tags: 'not @cluster'`), so the default run
needs **no cluster**, and the GitLab `e2e:bdd` job is `allow_failure: true`.

The tag is `@cluster` and not playwright-bdd's reserved `@skip` on purpose.
`@skip` drops a scenario from generation (`bddgen` emits 0 specs for it), so a
`@skip` suite cannot be *discovered*. `@cluster` is a plain filter tag: the
no-filter validation below generates and lists all 42 scenarios, which proves the
Gherkin compiles, while the default config keeps them dark.

The harness is pure test code in its own `e2e/` dir. It does not touch the Karma
unit build or any app code.

## Offline validation (no cluster)

With the default config, `npx playwright test --list` prints `Error: No tests
found` and exits 1. That is the dark state, not a failure.

```sh
npm install
npx bddgen            # default: 'not @cluster' → 0 specs (ships dark, intended)
npx playwright test --list   # → 0 tests (dark)

# Prove every feature compiles + all scenarios are discovered (no filter):
cat > pw-validate.config.ts <<'EOF'
import { defineConfig, devices } from '@playwright/test';
import { defineBddConfig } from 'playwright-bdd';
const d = defineBddConfig({ features: 'features/**/*.feature',
  steps: ['features/steps/**/*.ts', 'features/support/**/*.ts'] });
export default defineConfig({ reporter: [['list']],
  use: { ignoreHTTPSErrors: true, screenshot: 'on', video: 'on' },
  projects: [{ name: 'bdd', testDir: d, use: { ...devices['Desktop Chrome'] } }] });
EOF
npx bddgen -c pw-validate.config.ts
npx playwright test --list -c pw-validate.config.ts   # → 42 tests in 12 files
rm pw-validate.config.ts
```

## Running against a live stack (later wave)

Drop the `@cluster` tag from a feature (or run an override config without the
`not @cluster` filter), export `E2E_BASE_URL` (default
`https://host.docker.internal:8443`), then run `npm run bdd`.

The per-user `E2E_<ROLE>_PASSWORD` and shared `E2E_PASSWORD` env vars are
optional overrides. `tests/helpers/roles.ts` (`passwordFor()`) falls back to the
run-state `.e2e-credentials` file that hugmesh-generator's `make stack-seed`
writes (`$E2E_CREDENTIALS_FILE`, or a `.e2e-credentials` found by walking up
from cwd). There is no built-in literal password. If nothing resolves, the suite
throws, naming `make stack-seed`, rather than log in with a guessable default.
The offline validation above is unaffected: passwords resolve at login time, not
at `bddgen` or `--list` time.
