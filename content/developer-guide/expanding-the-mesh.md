---
title: "Expanding the mesh with ArgoCD"
section: "developer-guide"
slug: "expanding-the-mesh"
summary: "How a new service reaches a running HugMesh cluster: the two GitOps lanes, the app-of-apps layout, the service-catalog ApplicationSet, and the five things that must move together."
---

ArgoCD syncs a HugMesh cluster from git, in two layers. The **Application set**
(`specs/cluster/apps/*.yaml`) is applied once, file by file, by `bootstrap.sh`, from the
tree baked into the image. The **content** of each Application
(`specs/cluster/manifests/<dir>/`) is fetched from git by ArgoCD on every sync. A new
service needs files in both. After bootstrap nothing is `kubectl apply`-ed by hand. The
[GitOps payload page](/operations/gitops-payload) has the full account.

## There are two lanes, and picking the wrong one is the easiest mistake

Settle this first.

| | **Lane A — GitHub-rooted** | **Lane B — Forgejo catalog** |
|---|---|---|
| Status | **live today** | **scaffold**, not cut over |
| Where files go | `hugmesh-generator` | the service's **own** repo |
| What you add | `specs/cluster/manifests/<svc>/` + `specs/cluster/apps/NN-<svc>.yaml` | `hugmesh-deploy.yaml` + `deploy/` |
| Effect right now | manifest edits sync on the next ArgoCD poll; a new `apps/` file needs a new image, a re-provision, or the opt-in recursing root | **nothing runs** until the Forgejo cutover |

To run a service on a cluster today, **use Lane A**. Lane B is real and worth adopting;
nine repos already have. But the live GitHub-rooted ArgoCD ignores it, and every
adopter's descriptor says so in its own header.

## Lane A: add a service to the live cluster

### 1. Write the manifests

```
specs/cluster/manifests/<service>/
  deployment.yaml
  service.yaml
  kustomization.yaml
```

### 2. Add an Application

Write `specs/cluster/apps/NN-<service>.yaml`. On a device, `bootstrap.sh` applies every
file in the **baked** `apps/` tree with `kubectl apply`, so a file there **is** the
registration. That holds only for images built after you added it, or after a
re-provision. The script re-runs only with the KEYS USB inserted and `.provision-force` on
it, or with `KEYS_FORCE=1`. It is idempotent.

Most child Applications carry their own `automated: {prune: true, selfHeal: true}`. A
mistake in git reaches their workloads, and a manual change to them is reverted. A deleted
Application *object* stays deleted until the next re-provision.

The repo-recursing root (`specs/cluster/app-of-apps.yaml`, named `hugmesh-root` in
namespace `devops`) is **opt-in** (`HUGMESH_GITOPS_ROOT_RECURSE=1`). It reads `apps/` from
GitHub, so it ignores every build-time prune, and a file dropped into `apps/` is picked up
on the next sync. Use it for a dev cluster that tracks a branch. Never use it for a gated
image.

On the kind lane, `bootstrap-kind.sh` applies a curated list (`SSO_APPS`). Add your file
there, or the kind cluster never sees it. `lint:kind-profile-app-closure` guards the list.

### 3. Understand the numbering — it is not what it looks like

The two-digit prefix is a **human ordering convention for reading the directory**. It is
also the order in which `bootstrap.sh` applies the files, but ArgoCD does not wait between
them. ArgoCD orders by the `argocd.argoproj.io/sync-wave` annotation, and only among
children of one parent: the alternative *waved* root (`apps/00-app-of-apps-waved.yaml`),
which you point a bootstrap at on purpose. With the baked set, or the plain recursing
root, **every child syncs concurrently** and the set converges in a few reconcile loops.
Every hook Job is written to retry.

So the prefix tells a reader where your service belongs. The annotation sequences it only
under the waved root.

| Band | What lives there |
|---|---|
| `00`–`01` | cluster substrate (Cassandra, prod hygiene) |
| `02`–`04` | secrets, forge, registry (Vault, ESO, GitLab, Harbor) |
| `05`–`12` | identity, network policy, ingress (Casdoor, netpol) |
| `13x` | ApplicationSets (service catalog, optional services, node storage) |
| `14`–`17` | RBAC, admission policy (Kyverno), backing-service endpoints |
| `20`–`24` | gateways (plus headwind and the attestation server) |
| `28`–`39` | backend data + BFFs |
| `40`–`49` | frontends |
| `50`–`56` | heavy tier and optional services |
| `60` | image builders |
| `99` | tests |

There is a **paired-database idiom**: the database sits at wave *N* and its API at
wave *N+1* (`30`/`31`, `32`/`33`, `34a`/`34b`, `34c`/`34d`). Follow it if your service
owns a database.

### 4. Give it a route

Two sides, and both are required. The worked example is a BFF.

1. **The gateway route.** Add the route id, uri and path to the `routes:` list in the right
   gateway Application's Helm values (`specs/cluster/apps/20-gateway-{fe,be,pki}.yaml`,
   or `22-gateway-superadmin.yaml`). Order matters: **first match wins**.
2. **The access rows.** Add `(gateway, url_pattern, role, allow)` rows to the
   route-access schema. **Longest pattern wins**, so a `/**` floor governs every
   sub-path unless a longer row overrides it.
3. **The reserved prefix.** Add your new first path segment to
   `specs/cluster/reserved-prefixes.yaml`, then run `scripts/sync-reserved-configmap.sh`
   to regenerate the ConfigMap that mirrors it. Otherwise the `lint:reserved-prefixes` job
   (`scripts/validate-reserved-prefixes.sh`) fails the build.

### 5. Give it an identity

External Secrets Operator materialises secrets from Vault. A BFF or gateway that speaks
mTLS in-cluster needs its `hugmesh-<service>-mtls` ExternalSecret in
`specs/cluster/manifests/external-secrets/pki-externalsecrets.yaml`, not beside the
service's own manifests. (Infrastructure such as Cassandra and coturn keeps its TLS
ExternalSecret beside its manifests.)

### 6. If it has a UI

A frontend is a native-federation **remote**: its own repo, its own nginx, registered in
the federation module registry so the host shell can load it at runtime. The host reads
the manifest from the database at boot and unions it over the build-time static floor, so
the database can add a remote's entry URL without a host redeploy. The full registration
touches eight places; the federation walkthrough (`docs/FEDERATION-EXAMPLES.md` in
hugmesh-generator) lists each one.

## Lane B: the service catalog

The catalog is an ApplicationSet (`hugmesh-catalog`,
`specs/cluster/apps/13-service-catalog.yaml`, namespace `devops`). Its single generator is
an `scmProvider` pointing at the **in-cluster Forgejo**. It scans the org for repositories
matching `^hugmesh-` that contain a deploy descriptor and a `deploy/` directory, and
generates one Application per match.

### The two filters, and why there are two

```yaml
filters:
  - repositoryMatch: "^hugmesh-"
    pathsExist: ["hugmesh-deploy.yaml", "deploy"]
  - repositoryMatch: "^hugmesh-"          # LEGACY_COMPAT, pre-rebrand name
    pathsExist: ["<legacy-name>-deploy.yaml", "deploy"]
```

ArgoCD **ORs across `filters` entries and ANDs inside one**, and `pathsExist` is itself an
AND-list. So one entry cannot say "either descriptor name". It takes two entries, and the
rebrand is why both names are accepted. A repo that carries both still yields one
Application.

### The failure mode this protects against

**An `scmProvider` filter that matches nothing is not an error.** It generates no
Application, emits no event, produces no degraded app and writes no log line. A repo that
quietly stops being discoverable is *silent*.

That silence is why `specs/cluster/catalog/adopters.yaml` and
`scripts/validate-catalog-discovery.sh` exist. The validator runs in GitLab CI as
`lint:catalog-descriptor-discovery`. It fails the pipeline if a registered adopter ships a
descriptor that no generator matches.

Run it before you push:

```bash
bash scripts/validate-catalog-discovery.sh
```

Its exit codes: `0` PASS, `1` FAIL, `2` FATAL (missing input), and **`3`
INCOMPLETE**. That one is non-zero on purpose: a check that could not run has not passed.

### The descriptor's body is never parsed

This surprises people. The discovery contract is the **filename** plus a `deploy/`
directory, and nothing more:

- the Application **name** comes from the repository name, not the descriptor's
  `name:` field;
- namespace, image and replicas come from the `deploy/` kustomize.

The `route:` block in a descriptor is a **note to humans** about what somebody must seed
into the route-access table. Nothing automates it. Writing it there does not declare the
route.

### Five files move together

When a descriptor name changes, all five of these change with it. A stage of the gate
enforces each one separately:

1. the descriptor filename in the service's repo;
2. the `descriptor:` value in `adopters.yaml`;
3. a filter entry in **both** the ApplicationSet (`apps/13-service-catalog.yaml`) and its
   Handlebars twin (`templates/apps/13d-brand-repos.yaml.hbs`);
4. an entry in the render recipe's rename denylist (`RENAME_CONTRACT_DENYLIST` in
   `scripts/tooling/render-recipe.js`);
5. a behavioural case in `tests/domain-registry/test-templating-rename-pr.sh`.

## Running a cluster locally

```bash
make kind-up
```

**No GitHub credential is needed.** The checkout is bind-mounted read-only into the kind
node and served by an in-cluster `git daemon`.

Three things break it:

- the directory is not a git checkout;
- `.git` is a *file* rather than a directory, which means you are in a linked worktree;
- the cluster predates the mount. Delete and recreate it.

One property surprises everybody: **git daemon serves committed objects only**. ArgoCD
cannot see an uncommitted edit. Commit, then wait for the poll.

### The missing-credential signature

On a real cluster, ArgoCD needs a repository credential for the private GitOps repo.
Without it `bootstrap.sh` exits with:

```
FATAL: ARGOCD_REPO_TOKEN not set; the private repo https://github.com/hugmesh/hugmesh-generator.git needs an ArgoCD repository credential or every git-path Application (vault, casdoor, harbor-provision, forgejo, app-of-apps) will fail to sync with 'authentication required: Repository not found'.
```

Applications that already exist show `ComparisonError: authentication required: Repository
not found`. The kind bring-up ends with `FATAL: vault-0 never reached Running
(phase='not created')`. A missing `vault-0` is the tell. It sits downstream of the
Application that could not sync, so the *first* error you see is not the cause.

**Fix:** write a read-only token to `KEYS/gitops/repo-token`; `keys-provision` exports it
as `ARGOCD_REPO_TOKEN`. Set `ARGOCD_REPO_PUBLIC=1` only for a genuinely public fork.

Kind treats the two profiles differently. With no way to fetch the repo,
`KIND_PROFILE=sso` exits 1, and `core` warns and continues. And `provision.sh` calls
`bootstrap.sh` with `|| warn`, so a missing token gives a warning, not a failed
provision. That is why an incomplete cluster can look like a successful run.

## Gotchas worth knowing before you need them

- **Forking:** export `HUGMESH_GITOPS_REPO` and `HUGMESH_GITOPS_REV` before bootstrapping.
  On the default (baked) path, `bootstrap.sh` rewrites `repoURL` and `targetRevision` on
  every Application it applies. Under `HUGMESH_GITOPS_ROOT_RECURSE=1` it rewrites only the
  root, and the children come from the fork's git unchanged, so you must edit every per-app
  `repoURL` yourself.
- **Removing an app at build time:** the builders `rm -f` the application file from the
  baked tree, and `bootstrap.sh` never applies a file that is gone. That works only
  because the root is not in play. Under `HUGMESH_GITOPS_ROOT_RECURSE=1` the root
  re-syncs the file from git. Runtime add/remove is the `installed` flag on the
  optional-services ApplicationSet, not file deletion.
- **`selfHeal` and inert flags:** the recursing root declares `RespectIgnoreDifferences=true`
  and two `ignoreDifferences` entries on ApplicationSet list elements (`optional-services`
  and `casdoor-domains`). Without them, selfHeal would re-apply git's `installed: "false"`
  over a runtime enable. With the baked set no root self-heals, so the entries do nothing.
- **Eleven Applications have no automated sync** and read `OutOfSync` until somebody syncs
  them. Never gate readiness on Application status. Read the workload's
  `availableReplicas`.
- **The waved root is not applied by default.** `bootstrap.sh` skips
  `00-app-of-apps-waved.yaml` by name, and `ENV=prod` builds delete it, along with
  `99-test-runner.yaml`, from the baked tree.

## Where to read further

- The DevOps platform guide (`docs/DEVOPS.md` in hugmesh-generator) — ArgoCD, GitLab,
  the binhost and the runner, and how CI delivers ISOs.
- [Cluster architecture](/architecture/cluster-architecture) — the gateway, identity
  and multi-tenancy model your service sits inside.
- [Optional services](/operations/optional-services) — the `installed`-flag lane for
  services an operator turns on and off at runtime.
