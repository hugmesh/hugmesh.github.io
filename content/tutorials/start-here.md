---
title: "Start here — the tutorial track"
section: "tutorials"
slug: "start-here"
summary: "An ordered path from installing the Studio to a branded, federated mesh serving its own domain. Each step ends with something that works."
---

There are three different things people mean by "run HugMesh", and they need
different paths. Pick yours before you start — the fastest way to get stuck is to
follow the cluster instructions when you wanted the local stack.

| I want to… | Start at | Roughly |
|---|---|---|
| See the whole platform on one machine | [Step 2](#2-bring-up-the-whole-stack-locally) | an evening (the first build compiles ~28 images) |
| Run a real cluster on real hardware | [Step 5](#5-build-your-first-image) | a weekend |
| Contribute to a service | [Step 2](#2-bring-up-the-whole-stack-locally), then the [Developer Guide](/developer-guide) | an afternoon |

---

## 1. Install the Studio

The Studio is the front door: a wizard over the build scripts, plus a system tray
controller for a local mesh.

Two ways in:

```bash
# From a checkout (Linux). The guided launcher offers a venv if you lack one.
cd hugmesh-generator
./scripts/studio-launch.sh

# Or by hand, from the studio directory (all platforms)
cd hugmesh-generator/studio
python3 -m venv .venv && . .venv/bin/activate
pip install -r requirements.txt
./hugmesh-studio                    # Windows: hugmesh-studio.bat
```

Or install the [Windows MSI or Linux Flatpak](/downloads) — same application,
no Python environment needed.

`scripts/studio-launch.sh` runs an **idempotent, advisory-only** first-run bootstrap:
it symlinks `hugmesh-studio` and `hugmesh-build-menu` into `~/.local/bin` (no sudo, and
it never clobbers a file it did not create) and writes
`~/.hugmesh/studio/properties.json`. Starting `studio/hugmesh-studio` directly does not
run it. See [first-run bootstrap](/tutorials/first-run-bootstrap).

**Set your resource limits now**, before the first build — tray → **Resource limits**.
The Studio caps a dockerized build by default: every CPU core but one, and
`max(2 GiB, min(total − 4 GiB, ¾ of total))` of memory. Set the numbers yourself if you
plan to use the machine while it works. See
[resource limits](/operations/resource-limits).

**Done when:** the Studio opens and its mode picker (ten choices) appears.

---

## 2. Bring up the whole stack locally

This is the fastest way to see the platform, and it builds no OS images.

```bash
make stack-m2-bootstrap   # FIRST, on a cold checkout — see below
make stack-up
make stack-seed SEED_COMPLETE_REGISTRATION=1   # REQUIRED — without it, login does not work
```

Then open **<http://localhost:8088>**. (`https://localhost:8488` uses a per-machine CA;
import it or accept the browser warning.)

Three things people get wrong here:

- **`stack-m2-bootstrap` is not optional on a cold build.** It clones four library repos
  (`hugmesh-build-config`, `hugmesh-parent`, `hugmesh-commons`, `hugmesh-auth-core`) at
  pinned SHAs, `mvn install`s them into a persistent cache (`~/.cache/hugmesh-stack-maven`)
  and serves them from a local registry container. Without it, four Java services
  (admin-bff, user-bff, mod-bff, federation-api) cannot resolve their dependencies at
  image-build time.
- **`stack-up` alone does not make login work.** `stack-seed` creates the OAuth2 client
  and the org, roles and personas. A stack without it looks up and rejects every login.
  Without `SEED_COMPLETE_REGISTRATION=1` you can sign in but every service route
  answers 403, and the `mesh-operator` account does not exist (the Studio's bring-up
  passes the flag).
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
node and served by an in-cluster `git daemon`. Note that git daemon serves **committed
objects only** — an uncommitted edit is invisible to ArgoCD, so commit and wait for
the poll.

> **Set expectations honestly:** the kind cluster is a **slice**, not a small production
> cluster. It deploys the native-login path (Cassandra, Vault, Casdoor, the gateway,
> the admin and user BFFs, the host shell and a few UIs); other routes answer 503. Specs
> `01-frontpage` and `27-native-login` passed against it on 2026-08-06, and the two
> blockers this page once named (the Cassandra keyspace bootstrap and the gateway
> probes) are fixed on `main`. But spec 27 only checks that `POST /bff/login` mints the
> session cookie. On a fresh cluster on 2026-10-07, `GET /bff/session` answered 500,
> because the BFFs fetch Casdoor's signing keys from `id.hugmesh.net`, which does not
> resolve inside the cluster (issue 693; a fix is open as PR 709). Use this step to
> explore the GitOps layout, not as a production path. See
> [kind-local bring-up](/operations/kind-local-bringup) and the
> [kind SSO findings](/troubleshooting/kind-sso-e2e-findings).

**Done when:** `kubectl get applications -n devops` lists the Applications that
`bootstrap-kind.sh` applied. Run `make kind-doctor` to check that the cluster can run the
mesh (egress, images, pods, ArgoCD).

---

## 4. Run an emulated mesh under QEMU

A whole multi-node mesh, on one machine, with no hardware.

You need a finished build session first (step 5). In the Studio pick **Mesh emulation**:
it boots every image of a prior build session and keeps the guests up, with per-device
status, ssh logins, the QEMU console, disk saves, USB provisioning keys and the mesh's web
front door. The **Run e2e tests** card leads to the QEMU test lane, which boots a session,
asserts and powers off. Each guest gets 2 vCPUs by default; the emulation CLI
(`python3 -m hugmesh_studio.core.emulation`, with `PYTHONPATH=studio`) takes `--smp N`.

**Done when:** a device row reaches `running` and its shell opens.

---

## 5. Build your first image

Start with `--print-plan`. Every builder supports it: a dry run that resolves and
validates every flag, prints greppable `PLAN_KEY=VALUE` lines, and exits 0 with **no
root, no writes and no network**. Secrets print as `REDACTED`.

```bash
./build-x86-host-stage4.sh --print-plan -r pki
```

The Studio's equivalent is the command preview on the Review page — it shows the exact
argv, including the resource caps in force.

ARM boards (rpi5, frite, jetson, orangepi) cross-build, so they need the builder image
from `make docker-image` (cross-toolchain and a static `qemu-aarch64` included) and a
`--privileged` container. See [troubleshooting builds](/troubleshooting/build-failures).

Defaults worth knowing before you build:

- **Wi-Fi and Bluetooth are disabled** on the x86 and rpi5 node builders — a first-boot
  rfkill block plus blacklisted modules. Opt in with `--enable-wifi` /
  `--enable-bluetooth`.
- **Root SSH login is off** (`--permit-root-login no` is the default).

**Done when:** an `.img` (or `.img.xz` with `--compress`) or an `.iso` appears under
`out/`. Before trusting it, grep the log for `skipped` and `dropped` — see
[troubleshooting builds](/troubleshooting/build-failures) for why that matters.

---

## 6. Write the KEYS USB and first boot

The image contains **no keys**. Everything secret arrives from a FAT32 `KEYS`
partition at first boot, which is what lets the same image be published safely.

Generate the keys with `scripts/gen-provision-keys.sh -r <role> -o keys-<role>`, write
each stick with `sudo scripts/make-keys-usb.sh /dev/sdY keys-<role>` (one stick per
node), and flash the OS image with `scripts/flash-disk.sh` (or `make flash`).

Two defaults of the key generator:

- **No root password is generated**, and provisioning runs `passwd -l root`. Opt in
  with `--root-password`.
- **The privileged user's sudo is password-gated.** `--sudo-nopasswd` relaxes it.

The one thing that catches people: **worker KEYS sticks carry no `users.json`**. You
must copy `certs/cluster-ca.crt` and `keystores/truststore.jks` from the pki output
onto each worker stick, and fill in the kubeadm join token, the CA cert hash and the
mesh authkey. A worker stick missing those joins nothing.

**Done when:** the node boots and appears in the cluster.

---

## 7. Brand it

Boot screen, login theme, wallpaper and accent colour. The web login theme is applied
**at container start** — no rebuild — and the Studio previews the captured login page
in a real browser before you commit to it.

**Done when:** the login page carries your colours.

---

## 8. Set up your domain and go live

Domain, identity provider, then the Go-Live wizard. A mesh can serve locally, or be
exposed over a Tor `.onion`, a Dynamic-DNS host (DuckDNS or Cloudflare), a Cloudflare
tunnel, Tailscale Funnel or a router port-forward — each is opt-in and none is required.
See the [go-live wizard](/operations/go-live-wizard) and
[Tor hidden service](/operations/tor-hidden-service).

**Done when:** your login page answers on your own domain.

---

## 9. Add an optional service

Games, video (`tube`) and live streaming (`owncast`) are **off by default**; the fediverse
server (`akkoma`), Matrix (`tuwunel`) and the forum (`phpbb`) are **on by default** and
can be excluded. See [optional services](/operations/optional-services). Adding a *new*
service is a different job — that is the
[Developer Guide](/developer-guide/expanding-the-mesh).

---

## If a step does not work

Nearly every failure in the build lane has a known signature and a known fix. Look up
what you are **seeing** in [troubleshooting builds](/troubleshooting/build-failures)
rather than what you think went wrong — the same root cause shows up as three
different symptoms depending on which gate catches it.
