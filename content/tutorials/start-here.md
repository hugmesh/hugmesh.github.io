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

Three ways in, all equivalent:

```bash
# From a checkout (all platforms)
cd hugmesh-generator/studio
python3 -m venv .venv && . .venv/bin/activate
pip install -r requirements.txt
./hugmesh-studio                    # Windows: hugmesh-studio.bat
```

Or install the [Windows MSI or Linux Flatpak](/downloads) — same application,
no Python environment needed.

First run does an **idempotent, advisory-only** bootstrap: it symlinks `hugmesh-studio`
and `hugmesh-build-menu` into `~/.local/bin` (no sudo, and it never clobbers a file it
did not create) and writes `~/.hugmesh/studio/properties.json`.

**Set your resource limits now**, before the first build — tray → **Resource limits**.
A dockerized build is capped by default, but the CPU cap is worth setting deliberately
if you plan to use the machine while it works. See
[resource limits](/operations/resource-limits).

**Done when:** the Studio opens and its four-way mode picker appears.

---

## 2. Bring up the whole stack locally

This is the fastest way to see the platform, and it builds no OS images.

```bash
make stack-m2-bootstrap   # FIRST, on a cold checkout — see below
make stack-up
make stack-seed           # REQUIRED — without it, login does not work
```

Then open **<http://localhost:8088>**.

Three things people get wrong here:

- **`stack-m2-bootstrap` is not optional on a cold build.** It clones four org-private
  library repos at pinned SHAs, `mvn install`s them into a persistent cache and serves
  them from a local registry. Without it, four Java services cannot resolve their
  dependencies at image-build time.
- **`stack-up` alone does not make login work.** `stack-seed` creates the OAuth2 client
  and the org, roles and personas. A stack without it looks up and rejects every login.
- **The first build compiles about 28 images.** It is not hung. The Studio's Local Mesh
  page streams the output and has a Cancel that stops the whole process group.

From the Studio instead of the terminal: **Local Docker mesh** → *Check readiness* →
*Build maven prereqs (m2)* → *Generate && start* → *Open web UI*.

**Done when:** you can sign in at `localhost:8088` as the seeded operator.

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

> **Set expectations honestly:** the SSO kind end-to-end path is **not currently
> green**. It fails on a set of enumerated fresh-cluster blockers, most of them still
> open (Cassandra keyspace bootstrap, gateway probes hitting a role-gated actuator
> path so no gateway ever reports Ready). The cluster comes up; the full native-login
> e2e does not pass yet. Use this step to explore the GitOps layout, not as a
> production path.

**Done when:** `kubectl get applications -n devops` lists the app-of-apps children.

---

## 4. Run an emulated mesh under QEMU

A whole multi-node mesh, on one machine, with no hardware.

The Studio's QEMU page starts devices from built artifacts and gives each one a shell,
a QMP socket and a save-disk action. Set the guest vCPU count there — it maps to
`-smp` and is otherwise pinned at 2.

Register the ARM binfmt handler first, or aarch64 rows silently drop packages:

```bash
docker run --privileged --rm tonistiigi/binfmt --install arm64
```

**Done when:** a device row reaches `running` and its shell opens.

---

## 5. Build your first image

Start with `--print-plan`. Every builder supports it: a dry run that resolves and
validates every flag, prints greppable `PLAN_KEY=VALUE` lines, and exits 0 with **no
root, no writes and no network**. Secrets print as `REDACTED`.

```bash
./build-x86-host-stage4.sh --print-plan …
```

The Studio's equivalent is the command preview on the Review page — it shows the exact
argv, including the resource caps in force.

Defaults worth knowing before you build:

- **Wi-Fi and Bluetooth are disabled** on both node builders — a first-boot rfkill
  block plus blacklisted modules. Opt in with `--enable-wifi` / `--enable-bluetooth`.
- **No root password is generated**, and provisioning runs `passwd -l root`. Opt in
  with `--root-password`.
- **The privileged user's sudo is password-gated.** `--sudo-nopasswd` relaxes it.

**Done when:** an `.img.xz` (or `.iso`) appears under `out/`. Before trusting it,
grep the log for `skipped` and `dropped` — see
[troubleshooting builds](/troubleshooting/build-failures) for why that matters.

---

## 6. Write the KEYS USB and first boot

The image contains **no keys**. Everything secret arrives from a FAT32 `KEYS`
partition at first boot, which is what lets the same image be published safely.

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
exposed over a Tor `.onion`, a Dynamic-DNS host, or a tunnel — each is opt-in and none
is required.

**Done when:** your login page answers on your own domain.

---

## 9. Add an optional service

Games, video, wiki, forum and live streaming are **off by default** and turned on per
domain. Adding a *new* service is a different job — that is the
[Developer Guide](/developer-guide/expanding-the-mesh).

---

## If a step does not work

Nearly every failure in the build lane has a known signature and a known fix. Look up
what you are **seeing** in [troubleshooting builds](/troubleshooting/build-failures)
rather than what you think went wrong — the same root cause shows up as three
different symptoms depending on which gate catches it.
