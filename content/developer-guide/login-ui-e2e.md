---
title: "hugmesh-login-ui e2e — Playwright + playwright-bdd (Gherkin)"
section: "developer-guide"
slug: "login-ui-e2e"
summary: "The BDD-only Playwright harness for the auth entry point with feature specs and a shared fixture catalogue."
source_repo: "hugmesh-login-ui"
source_path: "e2e/README.md"
source_ref: "hugmesh/hugmesh-login-ui@HEAD"
---

BDD-only harness for the auth entry point: `.feature` specs under
`features/auth/`, step definitions under `features/steps/`, the shared World /
hooks in `features/support/fixtures.ts`, plain helpers + the fixture catalogue
in `tests/helpers/roles.ts`. `bddgen` compiles the features into specs below
`.features-gen/`; there are no handwritten `tests/*.spec.ts`.

## Two scenario classes

- **Offline (untagged)** — scenarios that mock only the relevant boundary (the
  `/bff/*` endpoints, the loopback Studio agent, or the i18n catalog) via
  `page.route()` and run the REAL component pipeline against it:
  `appeal-contact.feature`, `appeal-submit.feature` (the "signed-in" precondition
  is a mocked `GET /bff/session` — custody is the httpOnly cookie and nothing
  else, so there is no storage to seed), `session-cookie.feature` (cookie
  custody plus the `hug.session` fleet mirror: no credential in web storage, the
  server's roles hydrated and published to the mirror the not-yet-migrated
  remotes read, a sibling remote's own reader + `adminGuard` run verbatim in the
  page — admitting the signed-in admin, bouncing to `/login` after sign-out — a
  second tab converging on ONE mirror value with no re-hydrate storm, a
  cross-tab sign-out that expires the cookie before announcing it, and a
  not-yet-migrated host shell's mirror removal still reaching this tab), `mfa-enroll.feature`,
  `mfa-challenge.feature`, `mfa-security.feature`, `login-blocked.feature`
  (banned/suspended → appeal auto-route), `login-local-roles.feature`
  (passwordless Studio role picker), `login-banner.feature` (public
  announcements banner) and `locale.feature` (runtime `?lang=` locale). These
  execute for real **when the remote itself is served** at the baseURL — run
  them locally per "Running the offline suite locally" below, or via a
  served-remote CI job. NOTE: the current `e2e:bdd` CI job runs the OFFLINE GATE
  only (`bddgen` + `--list`) — it proves every scenario compiles and every step
  binds, but does NOT serve the remote, so it does not execute the scenarios;
  wiring a served-remote run into CI is tracked separately.
- **`@cluster`** — scenarios that need a live integration-test host (a real
  `POST /bff/login` round-trip through Casdoor, or the federated host shell):
  `login-native.feature` (the native username/password ALLOW path, MFA and the
  complete-registration gate), `login-deny.feature`, `error-a11y.feature`,
  `protected-route.feature` (the `registeredGuard` redirect; its ALLOW persona
  signs in for real — the session is never seeded from localStorage, only
  published to it) and the `@cluster`
  twin in `login-blocked.feature` (a genuinely-blocked account auto-routed to
  appeal). They are GENERATED but runtime-skipped by the `Before` hook unless
  `E2E_LIVE=1`, so `bddgen` + `--list` still prove every step is bound while the
  suite ships dark.

## Running the offline suite locally

The offline scenarios still need the REMOTE ITSELF served somewhere (only the
BFF is mocked). The standalone dev shell mounts `LOGIN_ROUTES` at `/` **and**
at `/login` (src/app/app.routes.ts), so it resolves the same `/login/*` URLs
the federated host serves. Either point the harness at a dev server:

```sh
# terminal 1 — repo root
npm start                      # ng serve login on http://localhost:4203

# terminal 2 — e2e/
npm install
E2E_BASE_URL=http://localhost:4203 npm run bdd
```

or serve a production build statically (any SPA-fallback static server over
`dist/login/browser`, with `/bff/*` answered 404 so unmocked calls fail closed
instead of receiving index.html).

Offline gate only (what CI's `e2e:bdd` job always runs first):

```sh
npm run bdd:list               # bddgen && playwright test --list
```

## Live runs

`E2E_LIVE=1` (plus `E2E_BASE_URL` for the integration host's front door) also
executes the `@cluster` scenarios. Artefacts land under `results/` (override
with `E2E_RESULTS_DIR`).
