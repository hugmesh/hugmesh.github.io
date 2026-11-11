---
title: "End-to-end tests"
section: "developer-guide"
slug: "end-to-end-tests"
summary: "The browser test pattern every web app shares, then what each repository covers."
---

Each HugMesh web app, and a few services, carries its own browser tests in an `e2e/`
folder. They all follow one pattern, so once you can run one suite you can run them all.
This page describes the pattern, then lists each suite.

## The shared pattern

The suites are written in Gherkin (`.feature` files) and run with Playwright through
[playwright-bdd](https://github.com/vitalets/playwright-bdd). The setup came from the
`hugmesh-games` end-to-end suite:

- one worker, running scenarios one after another;
- a screenshot and a video for every test, and an HTML report;
- a screenshot after every step, from the `AfterStep` hook in
  `features/support/fixtures.ts`;
- feature files under `features/`, step definitions beside them, and `bddgen`
  compiling the features into Playwright specs.

Assertions check a real change on the page, never only that an element exists.

### Two lanes: offline and `@cluster`

Scenarios that need a running mesh (the host shell serving the web app, its API and the
seeded sign-in accounts) are tagged `@cluster`. By default they are filtered out, so a
suite runs offline against the web app's own development server and needs no back end:

```bash
cd e2e
E2E_BASE_URL=http://localhost:<port> npx bddgen
E2E_BASE_URL=http://localhost:<port> npx playwright test --grep-invert @cluster
```

To run the `@cluster` scenarios, bring up the local Docker mesh
([Run the whole stack on one computer](/tutorials/local-docker-stack)), drop the filter,
point `E2E_BASE_URL` at the mesh and run `npm run bdd`.

### Passwords

The suites never contain a password. Each one resolves in this order:

1. a per-role variable such as `E2E_ADMIN_A_PASSWORD` or `E2E_MOD_PASSWORD`;
2. `E2E_PASSWORD`;
3. the `.e2e-credentials` file that `make stack-seed` writes in `hugmesh-generator`,
   found by searching upward from the working directory, or named by
   `E2E_CREDENTIALS_FILE`.

If none of them gives a password, the run stops with an error.

## The suites

| Repository | What its suite covers |
|---|---|
| [`hugmesh-admin-ui`](https://github.com/hugmesh/hugmesh-admin-ui/blob/main/e2e/README.md) | The admin console, with the deepest cross-user and deny coverage, since it is where access is granted. |
| [`hugmesh-login-ui`](https://github.com/hugmesh/hugmesh-login-ui/blob/main/e2e/README.md) | Sign-in, registration and multi-factor sign-in. |
| [`hugmesh-user-ui`](https://github.com/hugmesh/hugmesh-user-ui/blob/main/e2e/README.md) | The user console, where every resource must belong to the signed-in member. |
| [`hugmesh-mod-ui`](https://github.com/hugmesh/hugmesh-mod-ui/blob/main/e2e/README.md) | The moderator console: a moderator acts on users but not on admins. |
| [`hugmesh-matrix-ui`](https://github.com/hugmesh/hugmesh-matrix-ui/blob/main/e2e/README.md) | The Matrix chat web app. |
| [`hugmesh-mastodon-ui`](https://github.com/hugmesh/hugmesh-mastodon-ui/blob/main/e2e/README.md) | The fediverse web app, against Mastodon or Akkoma. |
| [`hugmesh-forum-ui`](https://github.com/hugmesh/hugmesh-forum-ui/blob/main/e2e/README.md) | The forum web app. |
| [`hugmesh-wiki-ui`](https://github.com/hugmesh/hugmesh-wiki-ui/blob/main/e2e/README.md) | The wiki web app and who may read and edit. |
| [`hugmesh-tube-ui`](https://github.com/hugmesh/hugmesh-tube-ui/blob/main/e2e/README.md) | The LocalTube console. |
| [`hugmesh-owncast-ui`](https://github.com/hugmesh/hugmesh-owncast-ui/blob/main/e2e/README.md) | The live streaming console, starting with who may broadcast. |
| [`hugmesh-actions`](https://github.com/hugmesh/hugmesh-actions/blob/main/e2e/README.md) | Role reconciliation across the two sign-in services, and the per-role access rules of its API. |
| [`hugmesh-host-shell`](https://github.com/hugmesh/hugmesh-host-shell/blob/main/e2e/README.md) | The host shell. This one differs: it runs on Nightwatch's Cucumber runner instead of Playwright. |

## Other test layers

- [How the platform tests itself](/architecture/test-architecture) covers the tests that
  run against a real cluster.
- [Multi-issuer security-slice tests](/developer-guide/multi-issuer-slice-pattern) covers
  the security test each API runs.
- The whole-mesh suite under `tests/e2e` in `hugmesh-generator` runs with
  `make stack-e2e`.
