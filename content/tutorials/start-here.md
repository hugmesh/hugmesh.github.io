---
title: "Start here — the tutorial track"
section: "tutorials"
slug: "start-here"
summary: "An ordered path from installing the Studio to a branded, federated mesh serving its own domain. Each step ends with something that works."
---

"Run HugMesh" means three different things, and each needs its own path. Pick yours
first. The quickest way to get stuck is to follow the cluster steps when you wanted the
local stack.

| I want to… | Start at | Roughly |
|---|---|---|
| See the whole platform on one machine | [Step 2](#2-bring-up-the-whole-stack-locally) | an evening (the first build compiles ~28 images) |
| Run a real cluster on real hardware | [Step 5](#5-build-your-first-image) | a weekend |
| Contribute to a service | [Step 2](#2-bring-up-the-whole-stack-locally), then the [Developer Guide](/developer-guide) | an afternoon |

---

## 1. Install the Studio

The Studio is the front door: a wizard over the build scripts, plus a system tray
controller for a local mesh.

From a checkout, two ways:

```bash
# Linux: the guided launcher offers a venv if you lack one.
cd hugmesh-generator
./scripts/studio-launch.sh

# Or by hand, from the studio directory (all platforms)
cd hugmesh-generator/studio
python3 -m venv .venv && . .venv/bin/activate
pip install -r requirements.txt
./hugmesh-studio                    # Windows: hugmesh-studio.bat
```

Or install the [Windows MSI or Linux Flatpak](/downloads). Same application, no Python
environment.

`scripts/studio-launch.sh` runs an **idempotent, advisory-only** first-run bootstrap. It
symlinks `hugmesh-studio` and `hugmesh-build-menu` into `~/.local/bin` (no sudo; it never
overwrites a file it did not create) and writes `~/.hugmesh/studio/properties.json`.
`studio/hugmesh-studio` skips it. See [first-run bootstrap](/tutorials/first-run-bootstrap).

**Set your resource limits now**, before the first build: tray → **Resource limits**.
The Studio already caps a dockerized build, at every CPU core but one. Set your own
numbers if you plan to use the machine while it works. See
[resource limits](/operations/resource-limits).

**Done when:** the Studio opens on its Welcome screen, and **Start building** leads to the
mode picker (ten choices).

---

## 2. Bring up the whole stack locally

This is the fastest way to see the platform. It builds no OS images.

```bash
make stack-m2-bootstrap   # FIRST, on a cold checkout — see below
make stack-up
make stack-seed SEED_COMPLETE_REGISTRATION=1   # REQUIRED — without it, login does not work
```

Then open **<http://localhost:8088>**.

Three things people get wrong:

- **`stack-m2-bootstrap` is not optional on a cold build.** It clones four org-private
  library repos at pinned SHAs, `mvn install`s them into a persistent cache and serves them from a
  local registry container. Without it, four Java services cannot resolve their
  dependencies at image-build time.
- **`stack-up` alone does not make login work.** `stack-seed` creates the OAuth2 client
  and the org, roles and personas. Without it the stack looks up and rejects every login.
  Without `SEED_COMPLETE_REGISTRATION=1` you can sign in, but every service route
  answers 403 and the `mesh-operator` account does not exist. (The Studio's bring-up
  passes the flag.)
- **The first build compiles about 28 images.** It is not hung. The Studio's Local Mesh
  page streams the output and has a Cancel that stops the whole process group.

From the Studio instead of the terminal: **Local Docker mesh** → *Check readiness* →
*Build maven prereqs (m2)* → *Generate && start* → *Open web UI*.

**Done when:** you can sign in at `localhost:8088` as `mesh-operator`. The shared
password is in `.e2e-credentials` at the repo root.

---

## 3. Run it on Kubernetes

```bash
make kind-images   # build from ./.stack-src and load into the node
make kind-up       # bootstrap-kind.sh
```

**No GitHub token is needed.** The checkout is bind-mounted read-only into the kind
node and served by an in-cluster `git daemon`. That daemon serves **committed objects
only**. ArgoCD cannot see an uncommitted edit, so commit and wait for the poll.

> **Know what you are getting.** The kind cluster is a **slice**, not a small production
> cluster. It deploys the native-login path (Cassandra, Vault, Casdoor, the gateway, the
> admin and user BFFs, the host shell, a few UIs). Other routes answer 503. Specs
> `01-frontpage` and `27-native-login` passed against it on 2026-08-06, and the blockers
> this page once named (the Cassandra keyspace bootstrap, the gateway probes) are fixed on
> `main`. But spec 27 only
> checks that `POST /bff/login` mints the session cookie. On a fresh cluster on
> 2026-10-07, `GET /bff/session` answered 500: the BFFs fetch Casdoor's signing keys from
> `id.hugmesh.net`, which does not resolve inside the cluster (issue 693; fix open as
> PR 709). Use this step to explore the GitOps layout, not as a production path. See
> [kind-local bring-up](/operations/kind-local-bringup) and the
> [kind SSO findings](/troubleshooting/kind-sso-e2e-findings).

**Done when:** `kubectl get applications -n devops` lists the Applications that
`bootstrap-kind.sh` applied.

---

## 4. Run an emulated mesh under QEMU

A whole multi-node mesh on one machine, with no hardware.

You need a finished build session first (step 5). In the Studio pick **Mesh emulation**.
It boots every image of that session and keeps the guests up, with per-device status, ssh
logins, the QEMU console, disk saves, USB provisioning keys and the mesh's web front door.
The **Run e2e tests** card leads to the test lane, which boots, asserts and powers off.
Each guest gets 2 vCPUs by default; the emulation CLI
(`python3 -m hugmesh_studio.core.emulation`, with `PYTHONPATH=studio`) takes `--smp N`.

**Done when:** a device row reaches `running` and its shell opens.

---

## 5. Build your first image

Start with `--print-plan`. Every builder supports it. It resolves and validates every
flag, prints greppable `PLAN_KEY=VALUE` lines, and exits 0 with **no root, no writes and
no network**. Secrets print as `REDACTED`.

```bash
./build-x86-host-stage4.sh --print-plan -r pki
```

The Studio's equivalent is the command preview on the Review page. It shows the exact
argv, including the resource caps in force.

ARM boards (rpi5, frite, jetson, orangepi) cross-build. They need the builder image from
`make docker-image` (cross-toolchain and a static `qemu-aarch64` included) and a
`--privileged` container. See [troubleshooting builds](/troubleshooting/build-failures).

Defaults worth knowing before you build:

- **Wi-Fi and Bluetooth are disabled** on the x86 and rpi5 node builders: a first-boot
  rfkill block plus blacklisted modules. Opt in with `--enable-wifi` /
  `--enable-bluetooth`.
- **Root SSH login is off** (`--permit-root-login no` is the default).

**Done when:** an `.img` (or `.img.xz` with `--compress`) or an `.iso` appears under
`out/`. Before you trust it, grep the log for `skipped` and `dropped`.
[Troubleshooting builds](/troubleshooting/build-failures) says why.

---

## 6. Write the KEYS USB and first boot

The image contains **no keys**. Everything secret arrives from a FAT32 `KEYS` partition
at first boot, which is what lets you publish the same image safely.

`scripts/gen-provision-keys.sh` generates the keys; `scripts/make-keys-usb.sh` writes the
stick (one per node). Two defaults of the key generator:

- **No root password is generated**, and provisioning runs `passwd -l root`. Opt in
  with `--root-password`.
- **The privileged user's sudo is password-gated.** `--sudo-nopasswd` relaxes it.

This catches people: **worker KEYS sticks carry no `users.json`**. Copy
`certs/cluster-ca.crt` and `keystores/truststore.jks` from the pki output onto each
worker stick. Then fill in the kubeadm join token, the CA cert hash and the mesh authkey.
A worker stick missing those joins nothing.

**Done when:** the node boots and appears in the cluster.

---

## 7. Brand it

Boot screen, login theme, wallpaper and accent colour. The web login theme applies
**at container start**, with no rebuild. The Studio previews the captured login page in a
real browser before you commit.

**Done when:** the login page carries your colours.

---

## 8. Set up your domain and go live

Domain, identity provider, then the Go-Live wizard. A mesh can serve locally, or be
exposed over a Tor `.onion`, a Dynamic-DNS host, or a tunnel. Each is opt-in; none is
required. See the [go-live wizard](/operations/go-live-wizard) and
[Tor hidden service](/operations/tor-hidden-service).

**Done when:** your login page answers on your own domain.

---

## 9. Add an optional service

Games, video (`tube`) and live streaming (`owncast`) are **off by default**. The fediverse
server (`akkoma`), Matrix (`tuwunel`) and the forum (`phpbb`) are **on by default** and
can be excluded. The Studio asks for a selection per domain, but it only records it: the
cluster does not yet enforce a per-domain choice (issue 496). See
[optional services](/operations/optional-services). Adding a *new*
service is a different job: the
[Developer Guide](/developer-guide/expanding-the-mesh) covers it.

---

## If a step does not work

Nearly every failure in the build lane has a known signature and a known fix. Look up
what you **see** in [troubleshooting builds](/troubleshooting/build-failures), not what you
think went wrong. One root cause shows up as three different symptoms, depending on which
gate catches it.
