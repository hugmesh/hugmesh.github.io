---
title: "hugmesh-login-ui e2e — Playwright + playwright-bdd (Gherkin)"
section: "developer-guide"
slug: "login-ui-e2e"
summary: "The BDD-only Playwright harness for the auth entry point with feature specs and a shared fixture catalogue."
source_repo: "hugmesh-login-ui"
source_path: "e2e/README.md"
source_ref: "hugmesh/hugmesh-login-ui@HEAD"
---

A BDD-only harness for the auth entry point. The pieces:

- `.feature` specs under `features/auth/`
- step definitions under `features/steps/`
- the shared World and hooks in `features/support/fixtures.ts`
- plain helpers and the fixture catalogue in `tests/helpers/roles.ts`

`bddgen` compiles the features into specs below `.features-gen/`. There are no handwritten
`tests/*.spec.ts`.

## Two scenario classes

- **Offline (untagged).** These scenarios mock only the boundary they need (the `/bff/*` endpoints,
  the loopback Studio agent, or the i18n catalog) with `page.route()`. They run the REAL component
  pipeline against it.
  - `appeal-contact.feature`
  - `appeal-submit.feature`: the "signed-in" precondition is a mocked `GET /bff/session`. Custody is
    the httpOnly cookie and nothing else, so there is no storage to seed.
  - `session-cookie.feature`: cookie custody plus the `hug.session` fleet mirror. It checks that no
    credential sits in web storage, and that the server's roles are hydrated and published to the
    mirror the not-yet-migrated remotes read. A sibling remote's own reader and `adminGuard` run
    verbatim in the page, admitting the signed-in admin and bouncing to `/login` after sign-out. A
    second tab converges on ONE mirror value with no re-hydrate storm. A cross-tab sign-out expires
    the cookie before it announces itself. A not-yet-migrated host shell's mirror removal still
    reaches this tab.
  - `mfa-enroll.feature`, `mfa-challenge.feature`, `mfa-security.feature`
  - `login-blocked.feature`: banned or suspended accounts auto-route to appeal.
  - `login-local-roles.feature`: the passwordless Studio role picker.
  - `login-banner.feature`: the public announcements banner.
  - `locale.feature`: the runtime `?lang=` locale.

  These run for real **when the remote itself is served** at the baseURL. Run them locally as
  described in "Running the offline suite locally" below, or in a served-remote CI job.

  NOTE: the current CI jobs (`e2e:bdd` in `.gitlab-ci.yml`, `e2e-compile` in
  `.github/workflows/ci.yml`) run the OFFLINE GATE only (`bddgen` + `--list`). That proves every
  scenario compiles and every step binds. It does NOT serve the remote, so it does not execute the
  scenarios. Wiring a served-remote run into CI is tracked separately.
- **`@cluster`.** These scenarios need a live integration-test host: a real `POST /bff/login`
  round-trip through Casdoor, or the federated host shell.
  - `login-native.feature`: the native username/password ALLOW path, MFA, and the
    complete-registration gate.
  - `login-deny.feature`
  - `error-a11y.feature`
  - `protected-route.feature`: the `registeredGuard` redirect. Its ALLOW persona signs in for real.
    The session is never seeded from localStorage, only published to it.
  - the `@cluster` twin in `login-blocked.feature`: a genuinely blocked account auto-routed to
    appeal.

  These are GENERATED but skipped at runtime by the `Before` hook unless `E2E_LIVE=1`. So `bddgen`
  and `--list` still prove every step is bound, while the suite ships dark.

## Running the offline suite locally

The offline scenarios still need the REMOTE ITSELF served somewhere. Only the BFF is mocked. The
standalone dev shell mounts `LOGIN_ROUTES` at `/` **and** at `/login` (src/app/app.routes.ts), so it
resolves the same `/login/*` URLs the federated host serves. Either point the harness at a dev
server:

```sh
# terminal 1 — repo root
npm start                      # ng serve login on http://localhost:4203

# terminal 2 — e2e/
npm install
E2E_BASE_URL=http://localhost:4203 npm run bdd
```

or serve a production build statically: any SPA-fallback static server over `dist/login/browser`,
with `/bff/*` answered 404 so unmocked calls fail closed instead of receiving index.html.

Offline gate only (all that CI runs):

```sh
npm run bdd:list               # bddgen && playwright test --list
```

## Live runs

`E2E_LIVE=1` also executes the `@cluster` scenarios. Set `E2E_BASE_URL` to the integration host's
front door. Artefacts land under `results/`; override the path with `E2E_RESULTS_DIR`.
