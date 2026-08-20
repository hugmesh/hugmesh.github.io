---
title: "Expanding the mesh with ArgoCD"
section: "developer-guide"
slug: "expanding-the-mesh"
summary: "How a new service reaches a running HugMesh cluster: the two GitOps lanes, the app-of-apps layout, the service-catalog ApplicationSet, and the five things that must move together."
---

Everything in a HugMesh cluster is synced by ArgoCD from git. Adding a service means
adding files that ArgoCD already watches — there is no imperative step, and nothing is
`kubectl apply`-ed by hand.

## There are two lanes, and picking the wrong one is the easiest mistake

This is the thing to get straight before anything else.

| | **Lane A — GitHub-rooted** | **Lane B — Forgejo catalog** |
|---|---|---|
| Status | **live today** | **scaffold**, not cut over |
| Where files go | `hugmesh-generator` | the service's **own** repo |
| What you add | `specs/cluster/manifests/<svc>/` + `specs/cluster/apps/NN-<svc>.yaml` | `hugmesh-deploy.yaml` + `deploy/` |
| Effect right now | ArgoCD picks it up on the next sync | **nothing runs** until the Forgejo cutover |

If you want a service running on a cluster today, **use Lane A**. Lane B is real and
worth adopting — nine repos already have — but the live GitHub-rooted ArgoCD ignores
it, and every adopter's descriptor says so in its own header.

## Lane A: add a service to the live cluster

### 1. Write the manifests

```
specs/cluster/manifests/<service>/
  deployment.yaml
  service.yaml
  kustomization.yaml
```

### 2. Add an Application

`specs/cluster/apps/NN-<service>.yaml`. The root Application
(`specs/cluster/app-of-apps.yaml`, named `hugmesh-root` in namespace `devops`)
recurses `specs/cluster/apps/`, so a file dropped there **is** the registration.

Its sync policy is `automated: {prune: true, selfHeal: true}`, so a mistake in git
propagates and a manual change to the cluster is reverted.

### 3. Understand the numbering — it is not what it looks like

The two-digit prefix is a **human ordering convention for reading the directory**.
ArgoCD orders by the `argocd.argoproj.io/sync-wave` annotation, and only under the
*waved* root. Under the default recursing root, **every child syncs concurrently**.

So the prefix tells a reader where your service belongs; the annotation is what
actually sequences it.

| Band | What lives there |
|---|---|
| `00`–`01` | cluster substrate (Cassandra, prod hygiene) |
| `02`–`04` | secrets, forge, registry (Vault, ESO, GitLab, Harbor) |
| `05`–`12` | identity, network policy, ingress (Casdoor, netpol) |
| `13x` | ApplicationSets (service catalog, optional services, node storage) |
| `14`–`16` | RBAC and admission policy (Kyverno) |
| `20`–`24` | gateways |
| `28`–`39` | backend data + BFFs |
| `40`–`49` | frontends |
| `50`–`56` | heavy tier and optional services |
| `60` | image builders |
| `99` | tests |

There is a **paired-database idiom**: the database sits at wave *N* and its API at
wave *N+1* (`30`/`31`, `32`/`33`, `34a`/`34b`, `34c`/`34d`). Follow it if your service
owns a database.

### 4. Give it a route

Two sides, and both are required. Using a BFF as the worked example:

1. **The gateway route.** Add the route id, uri and path to the right gateway
   application's Helm values. Order matters — **first match wins**.
2. **The access rows.** Add `(gateway, url_pattern, role, allow)` rows to the
   route-access schema. **Longest pattern wins**, so a `/**` floor governs every
   sub-path unless a longer row overrides it.
3. **The reserved prefix.** Add your new first path segment to
   `specs/cluster/reserved-prefixes.yaml`, or the `lint:reserved-prefixes` job fails
   the build.

### 5. Give it an identity

Secrets are materialised by External Secrets Operator from Vault. A service that
speaks mTLS in-cluster needs its `<name>-mtls` ESO Secret declared alongside its
manifests.

### 6. If it has a UI

A frontend is a native-federation **remote**: its own repo, its own nginx, registered
in the federation module registry so the host shell can load it at runtime. It does
not need a host redeploy — the manifest is read from the database at boot, unioned
over the build-time static floor.

## Lane B: the service catalog

The catalog is an ApplicationSet (`hugmesh-catalog`, namespace `devops`) whose single
generator is an `scmProvider` pointing at the **in-cluster Forgejo**. It scans the org
for repositories matching `^hugmesh-` that contain a deploy descriptor and a `deploy/`
directory, and generates one Application per match.

### The two filters, and why there are two

```yaml
filters:
  - repositoryMatch: "^hugmesh-"
    pathsExist: ["snapdragon-deploy.yaml", "deploy"]
  - repositoryMatch: "^hugmesh-"
    pathsExist: ["hugmesh-deploy.yaml", "deploy"]
```

ArgoCD **ORs across `filters` entries and ANDs inside one**, and `pathsExist` is
itself an AND-list. So a single entry cannot express "either descriptor name" — it
takes two entries, and the rebrand is why both names are accepted.

### The failure mode this protects against

**An `scmProvider` filter that matches nothing is not an error.** It generates no
Application, emits no event, produces no degraded app and writes no log line. A repo
that quietly stops being discoverable is *silent*.

That silence is the entire reason `specs/cluster/catalog/adopters.yaml` and
`scripts/validate-catalog-discovery.sh` exist. The validator runs in CI as
`lint:catalog-descriptor-discovery` and fails the pipeline if a registered adopter
ships a descriptor no generator matches.

Run it yourself before you push:

```bash
bash scripts/validate-catalog-discovery.sh
```

Note its exit codes: `0` PASS, `1` FAIL, `2` FATAL (missing input), and **`3`
INCOMPLETE** — deliberately non-zero, because a check that could not run is not a
check that passed.

### The descriptor's body is never parsed

This surprises people. Presence of the **filename**, plus a `deploy/` directory, is
the entire discovery contract:

- the Application **name** comes from the repository name, not the descriptor's
  `name:` field;
- namespace, image and replicas come from the `deploy/` kustomize.

In particular, the `route:` block in a descriptor is a **note to humans** about what
somebody must seed into the route-access table. Nothing automates it. Do not ship a
service believing its route was declared because you wrote it there.

### Five files move together

When a descriptor name changes, all five of these must change with it — and each is
separately enforced by a stage of the gate:

1. the descriptor filename in the service's repo;
2. the `descriptor:` value in `adopters.yaml`;
3. a filter entry in **both** the ApplicationSet and its Handlebars template;
4. an entry in the render recipe's rename denylist;
5. a behavioural case in the templating rename test.

## Running a cluster locally

```bash
make kind-up
```

**No GitHub credential is needed.** The checkout is bind-mounted read-only into the
kind node and served by an in-cluster `git daemon`.

Three things break it:

- the directory is not a git checkout;
- `.git` is a *file* rather than a directory — i.e. you are in a linked worktree;
- the cluster predates the mount, in which case delete and recreate it.

And one property surprises everybody: **git daemon serves committed objects only**.
An uncommitted edit is invisible to ArgoCD. Commit, then wait for the poll.

### The missing-credential signature

On a real cluster, ArgoCD needs a repository credential. Without it you get:

```
ComparisonError: authentication required: Repository not found
FATAL: vault-0 never reached Running (phase='not created')
```

`vault-0` never being created is the tell — it is downstream of the Application that
could not sync, so the *first* error you see is not the cause.

**Fix:** write the token to `KEYS/gitops/repo-token`. Set `ARGOCD_REPO_PUBLIC=1` only
for a genuinely public fork.

Note the profile asymmetry: the **sso** profile fails closed, while **core** warns and
continues. And `provision.sh` calls `bootstrap.sh` with `|| warn`, so a missing token
produces a warning, not a failed provision — which is why an incomplete cluster can
look like a successful run.

## Gotchas worth knowing before you need them

- **Forking:** `bootstrap.sh` only rewrites the **root** Application's `repoURL`. A
  fork needs all 91 per-app `repoURL`s edited.
- **Removing an app at build time:** `rm -f` on an application file only affects the
  bootstrap seed. The live root re-syncs it from git. Runtime add/remove is the
  `installed` flag on the optional-services ApplicationSet, not file deletion.
- **`selfHeal` and inert flags:** the root declares `RespectIgnoreDifferences=true`
  and two `ignoreDifferences` entries on ApplicationSet list elements. Without them,
  selfHeal would re-apply git's `installed: "false"` over a runtime enable.
- **Eleven Applications are MANUAL by design** and are `OutOfSync` permanently. Never
  gate readiness on Application status — read the workload's `availableReplicas`.
- **The waved root is not excluded** by the default root, and is only pruned in
  `ENV=prod`.

## Where to read further

- [DevOps platform](/operations/devops-namespace) — ArgoCD, GitLab, the binhost and
  the runner, and how CI delivers ISOs.
- [Cluster architecture](/architecture/cluster-architecture) — the gateway, identity
  and multi-tenancy model your service sits inside.
- [Optional services](/operations/optional-services) — the `installed`-flag lane for
  services an operator turns on and off at runtime.
