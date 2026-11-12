---
title: "Your first mesh, step by step"
section: "tutorials"
slug: "start-here"
summary: "The whole path in order, from installing the Studio to your devices joining the mesh. Each step ends with a check."
---

This is the path from nothing to a mesh running on your own hardware, in the order you
do it. Each step ends with a "Done when" line, so you know it worked before you move on.

If you only want to see the platform first, do step 2 and stop there. If you want to
change a service rather than run a mesh, the [Developer guide](/developer-guide) is the
better start.

| You want to | Do | Roughly |
|---|---|---|
| See every service on one computer | steps 1 and 2 | an evening; the first build compiles about 28 container images |
| Run a mesh on your own hardware | steps 1 to 8 | a weekend |
| Add services to a running mesh | step 9 | an hour per service |

---

## 1. Install the Studio

The Studio is a desktop app that puts the build scripts behind a wizard and runs a local
mesh from the system tray.

[Download it](/downloads). There is a Windows MSI, a Flatpak for x86_64 or ARM64 Linux,
and an x86_64 Linux tarball. The Flatpak carries the build scripts of its own release and
sets them up on first start. The MSI and the tarball do not carry them yet: on first start
they ask for the folder you cloned `hugmesh-generator` into, and the Downloads page gives
you the clone line.

What a package can and cannot do:

- It builds images, using Docker on the same machine, and can generate each node's keys.
- Writing an image to a device works on Linux, from the tarball or from a checkout. The
  Flatpak and the Windows MSI cannot write to a device.
- A native Gentoo build, without Docker, needs a Gentoo host. The Flatpak refuses it.
- A KEYS stick is written with a script from a checkout (step 4).

[Install the Studio](/studio/installers) covers each package and the checkout. If you
plan to keep using the machine while it builds, set your limits first: tray, then
**Resource limits** ([Limit CPU, memory and GPU for builds](/operations/resource-limits)).
A Docker build is already capped at every CPU core but one.

**Done when:** the Studio opens on its Welcome screen, and **Start building** leads to the
build menu with ten cards.

---

## 2. Try it locally first (optional)

The quickest way to see the platform is the **Local Docker mesh** card. It runs every
service on this machine in Docker and builds no OS images. From a terminal in the
`hugmesh-generator` checkout, the same thing is:

```bash
make stack-m2-bootstrap   # first time only: builds the shared Java libraries into a local cache
make stack-up
make stack-seed SEED_COMPLETE_REGISTRATION=1
```

Then open <http://localhost:8088>.

Three things catch people out:

- On a fresh checkout, `stack-m2-bootstrap` is needed. Without it four Java services
  cannot resolve their dependencies while their images build.
- `stack-up` alone does not make sign-in work. `stack-seed` creates the sign-in client,
  the organisation, the roles and the test accounts, and without
  `SEED_COMPLETE_REGISTRATION=1` every service answers 403 and the `mesh-operator`
  account does not exist. The Studio passes the flag for you.
- The first build compiles about 28 images and takes a while. It has not hung; the
  Studio streams its output and its Cancel stops the whole build.

[Run the whole stack on one computer](/tutorials/local-docker-stack) has the details and
the known failures.

**Mesh emulation** is the other way to try it: it boots the images of a finished build as
virtual machines on this computer, with a console, SSH and disk saves for each. It needs a
build, so come back to it after step 3.

**Done when:** you can sign in at `localhost:8088` as `mesh-operator`. The password is in
`.e2e-credentials` at the root of the checkout.

---

## 3. Build your images

In the Studio, pick **Mesh node**. The wizard walks you through the domains, the users
and the images to build, one per node, then shows the exact build command on its Review
page before anything runs. [Every screen of the Studio wizard](/studio/walkthrough)
describes each step.

The nodes are Raspberry Pi 5 boards or x86_64 computers. A small mesh is a `pki` node,
which runs the cluster's control plane, plus a `backend` and a `frontend` node. The
[build matrix](/reference/build-matrix) lists every role and platform.

From the command line, every builder takes `--print-plan`. It checks every flag, prints
what it would do, and exits without root, writes or network:

```bash
./build-x86-host-stage4.sh --print-plan -r pki
```

Defaults worth knowing:

- Wi-Fi and Bluetooth are off on the x86_64 and Raspberry Pi node images. Turn them on
  with `--enable-wifi` and `--enable-bluetooth`.
- Root cannot log in over SSH.

[Build, key, flash and boot from the command line](/tutorials/run-a-mesh) is the same
path with the scripts and `make` targets.

**Done when:** an `.img` (or `.img.xz`) or an `.iso` appears under `out/`. Search the build
log for `skipped` and `dropped` before you trust it;
[Build failures by symptom](/troubleshooting/build-failures) explains why.

---

## 4. Write the KEYS sticks

An image carries no secrets. Each node gets its own USB stick, formatted FAT32 and
labelled `KEYS`, with its keys, certificates and settings. That is what makes it safe to
build one image and use it on many nodes. [The KEYS stick](/operations/keys-usb) lists
everything a stick can hold.

A mesh build in the Studio can generate each node's keys folder for you. The stick itself
is written with `make-keys-usb.sh` from a checkout, as root, because it formats a whole
disk. From the command line, the whole step is:

```bash
./scripts/gen-cluster-secrets.sh
./scripts/gen-provision-keys.sh -r pki      -o keys-pki
./scripts/gen-provision-keys.sh -r backend  -o keys-backend
./scripts/gen-provision-keys.sh -r frontend -o keys-frontend
sudo ./scripts/make-keys-usb.sh /dev/sdY keys-pki    # one stick per node
```

Two defaults of the key generator: no root password is set (root is locked), and the
admin user's `sudo` asks for a password. `--root-password` and `--sudo-nopasswd` change
them.

A third default decides step 6. The `provision.json` generated for the `pki`, `backend`
and `frontend` roles has `"bootstrap": false` in its `kubernetes` block, which means the
node only prepares its Kubernetes configuration and leaves `kubeadm` to you. For a node
to create or join the cluster by itself at first boot, change that value to `true` in the
node's `provision.json` before you write its stick.

`make-keys-usb.sh` runs on Linux only. On Windows, format a USB stick of 32 GB or less as
FAT32 (not exFAT or NTFS, which some nodes cannot mount) with the label `KEYS`, and copy
the node's keys folder onto it, leaving out its `vault-seed` folder.

A worker stick does not carry the user accounts. It does need `certs/cluster-ca.crt` and
`keystores/truststore.jks` copied from the `pki` keys, and the cluster join token, the CA
certificate hash and the private-network key filled in. A worker stick without them joins
nothing. The join token and the hash do not exist until the `pki` node has created the
cluster, so write the `pki` stick now and finish the worker sticks in step 7.

**Done when:** the `pki` node has its stick, every other node has a keys folder, and
`provision.json` in each one names the right hostname and role.

---

## 5. Flash and boot the first node

Write the `pki` image to its SD card or disk. The Studio can do this right after a build:
on the Review page, assign an attached device as the flash target for an image, and it is
written when the build succeeds. Each write checks the device again first. From the
command line, `scripts/flash-disk.sh` (or `make flash`) does the same, and `--list` shows
what it would write without root.

Insert the node's KEYS stick and power it on. At first boot it reads the stick: users,
SSH keys, hostname, certificates, the private network and its Kubernetes settings. A node booted without a stick still starts, with a console
user, so you are never locked out.

**Done when:** you can log in to the node over SSH with the key from its stick, for
example `ssh -i keys-pki/ssh/admin_ed25519 admin@<node>`.

---

## 6. Bring up the cluster

The `pki` node creates the cluster at first boot when two settings in its
`provision.json` are on: `kubernetes.bootstrap` (step 4; off unless you changed it) and
`hugmesh.gitops.enabled` (on in a generated `pki` folder). It then runs `kubeadm init`
and installs ArgoCD, which installs every service from the configuration baked into the
image.

If you left `kubernetes.bootstrap` off, the node has only prepared its configuration,
and it will not read the stick again by itself. Set the value to `true` in
`provision.json` on the stick, put an empty file named `.provision-force` beside it, and
restart the node with the stick in. The other way is to run `kubeadm init` and then the
bootstrap script by hand;
[What the cluster deploys](/operations/gitops-payload#bootstrapping) has that command.

Watch the cluster settle from the `pki` node:

```bash
export KUBECONFIG=/etc/kubernetes/admin.conf
kubectl -n devops get applications
kubectl get pods -A
```

[What the cluster deploys](/operations/gitops-payload) describes that configuration, and
[The KEYS stick](/operations/keys-usb) lists every `provision.json` setting.

**Done when:** `kubectl -n devops get applications` lists the platform's applications.

---

## 7. Join the other nodes and your own devices

First finish the worker sticks. On the `pki` node, print a join command:

```bash
sudo kubeadm token create --print-join-command
```

It shows the API server address, a token and a `sha256:` hash. Put the token and the hash
into `kubernetes.join` in each worker's `provision.json`, set `kubernetes.bootstrap` to
`true` there too, and write the sticks as in step 4. A node that created the cluster by
itself also keeps one such command in `/etc/hugmesh/kubeadm-join.cmd`.

Then flash and boot the `backend` and `frontend` nodes the same way, each with its own
stick. With `kubernetes.bootstrap` on, each joins the cluster at first boot. With it off,
run the printed `kubeadm join` command on the node yourself.

Your own computers and phones join as clients, not cluster nodes:

- Laptops, Chromebooks and desktops use a
  [mesh desktop image](/devices/client-images).
- A Linux or Windows computer that already runs Docker can
  [join with Docker](/operations/docker-mesh-node), without reinstalling.
- Phones and headsets are enrolled with [MDM](/devices/mobile-device-management).

**Done when:** `kubectl get nodes` lists every node as Ready.

---

## 8. Brand it and go live

Set the boot screen, the sign-in page theme, the wallpaper and the accent colour. The
sign-in theme applies when its container starts, with no rebuild, and the Studio shows the
captured sign-in page in a real browser before you commit.

Then choose how people reach the mesh. It can stay local, or be served as a
[Tor onion service](/operations/tor-hidden-service), on a dynamic DNS name, or through a
tunnel. Each is opt-in. [Go live with the wizard](/operations/go-live-wizard) walks
through the choice, and [Put your mesh online](/tutorials/serve-your-mesh) covers the
whole path from a local sign-in page to a public one.

**Done when:** your sign-in page answers at the address you chose.

---

## 9. Add optional services

Games, video (LocalTube) and live streaming (Owncast) are off by default. The fediverse
server (Akkoma), Matrix (tuwunel) and the forum (phpBB) are on by default and can be left
out. The Studio asks for a choice per domain, but for now it only records it: the cluster
does not yet enforce a different choice per domain.
[Choose which services run](/operations/optional-services) has the details.

Adding a service that does not exist yet is a different job;
[Add a service to the mesh](/developer-guide/expanding-the-mesh) covers it.

---

## If a step does not work

Most build failures have a known signature and a known fix. Look up the error text you
see in [Build failures by symptom](/troubleshooting/build-failures). To explore the
cluster's GitOps layout on Kubernetes without any hardware, see
[Run the cluster locally with kind](/operations/kind-local-bringup) in the Developer guide.
