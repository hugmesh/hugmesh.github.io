---
title: "Troubleshooting builds"
section: "troubleshooting"
slug: "build-failures"
summary: "A symptom-first index of real HugMesh build failures — the exact error text, what actually caused it, and the fix."
---

Look up what you are **seeing**, not what you think went wrong. The same root cause
surfaces as three different failures depending on which gate catches it first, so this
page is organised by observable symptom.

Every entry below is a real, dated failure from this project, not a hypothetical. The
error text is quoted as it appears.

> **Before you dig in:** almost every guard in the build scripts is a tombstone for one
> of these. If a build stops in the first minute with a clear message, that is a
> preflight doing its job — the fix is usually in the message.

## The build "hung"

### The desktop froze and the machine rebooted

A dockerized **fleet** build compiled llvm's 32-bit multilib pass at `-j8` inside an
**unbounded** container, on a 31 GiB desktop that was also running a browser and an
IDE, whose 4 GiB of swap was already full. From the operator's side the desktop simply
died.

**Fix:** cap the builder. Studio → tray → **Resource limits**, or:

```bash
HUGMESH_BUILD_MEMORY=16g HUGMESH_CPUS=6 ./build-x86-host-stage4.sh …
```

A capped container OOMs — an honest build failure — instead of taking the host with
it. `--memory-swap` is pinned equal to `--memory` so a runaway compile cannot thrash
the host's swap, which was the incident's signature.

### The build is 10–20× slower than it should be, with no error

Your checkout is on a Windows drive, reached from WSL2 over 9p/virtiofs. Every
`open()`, `stat()` and `rename()` leaves the VM, and a build is hundreds of thousands
of those.

It does not present as slowness. It presents as **"the build hung"**, and nothing
errors, so nothing explains it.

**Fix:** move the checkout inside the WSL2 filesystem (`~/`, not `/mnt/c/`). The
Studio detects this by reading the filesystem *type* out of `/proc/mounts` rather than
pattern-matching the path — a bind mount or a symlink into `/mnt/c` looks like a Linux
path and is just as slow.

### Logs are enormous and every merge crawls

```
[WARNING] _do_sendfile failed unexpectedly
OSError: [Errno 22] Invalid argument   (portage/util/file_copy.py:89)
```

Repeated — in one recorded log, **150,692 times**. Your work directory is on eCryptfs
(`/home/.Private`).

**Fix:** the builder detects `ecryptfs` from `df -T` and works around it. If you are
driving the scripts directly, put the work directory on a filesystem that is not
encrypted per-file.

### `File name too long` during a Go build

kubelet, runc, cni-plugins and containerd have deeply vendored cache paths. eCryptfs
caps filenames at roughly **143 characters**.

**Fix:** same as above — the builder binds the chroot's `/var/tmp` elsewhere when it
detects eCryptfs.

## The build died with a resolution wall

### `emerge: there are no ebuilds built with USE flags to satisfy …`

```
emerge: there are no ebuilds built with USE flags to satisfy ">=dev-libs/glib-2.82.0:2[introspection]"
!!! One of the following packages is required to complete your request:
- dev-libs/glib-2.88.2::gentoo (Change USE: +introspection)
```

A **global USE mask** in `make.conf.tmpl` made a requested atom unresolvable. The
recorded case was `firewalld` on rpi5, needing `glib[introspection]` against a global
`USE=-introspection`.

**Fix:** add a *scoped* override — `dev-libs/glib introspection` in the platform's
`package.use` — rather than dropping the global mask. A regression gate catches this
class before the build starts:

```
FAIL [rpi5] requested atom net-firewall/firewalld is UNRESOLVABLE:
global USE=-introspection (make.conf.tmpl) with no scoped package.use override
```

### `Multiple package instances within a single package slot … slot conflict`

```
!!! Multiple package instances within a single package slot have been pulled
into the dependency graph, resulting in a slot conflict: dev-python/requests:0
```

`PYTHON_TARGETS` REPLACE-vs-ADD. The seed's portage was frozen on the seed's targets,
so a partial retarget pulled two instances of the same slot.

### `The following USE changes are necessary to proceed: … python_targets_python3_12`

The mirror image of the above: the seed shipped portage built with the *other*
Python target. Pinning to a single version flips the other flag off on rebuilds and
wedges the tree.

**Fix for both:** see the slot-conflict analysis in the generator's
`docs/PYTHON-TARGETS-SEED-DRIFT.md` — the working posture is to retarget *additively*
and to update portage with `--newuse` rather than excluding it.

### `masked by: ~amd64 keyword` on a cross build, but only the host half

The cross-emerge resolves **BDEPENDs against the container's own amd64
`/etc/portage`**, not the target's. Per-platform `package.accept_keywords` under
`specs-*/portage/` covers the sysroot side and does nothing for the host side.

**Fix:** pre-seed the *host* `package.accept_keywords` / `package.use` for the
build-time dependency. This is the single most common cross-build wall.

### `configure: error: C compiler cannot create executables`

Something tried to cross-*rebuild the toolchain itself*. Target gcc/glibc/binutils
cannot be built this way, because the build has to run freshly-built target binaries
on the x86 host.

**Fix:** the payload emerge always carries `--exclude sys-devel/gcc` and friends. If
you are invoking emerge by hand, keep those exclusions.

### `<tool> not found in PATH` in the first minute

No cross toolchain. ARM targets (`rpi5`, `frite`, `jetson*`) need
`aarch64-unknown-linux-gnu-gcc`.

```bash
crossdev --stable --target aarch64-unknown-linux-gnu
```

Or use a builder image built with `CROSSDEV=1`.

## The build "succeeded" but the image is wrong

This family is the dangerous one: **exit code 0, artifacts produced, something
missing**. Check here whenever a built image misbehaves.

### A package you asked for is simply absent

```
WARNING: skipped net-firewall/firewalld
…
Stage4 payload verified (…)
```

`--keep-going` dropped a requested atom, the build carried on, and all three
`.img.xz` artifacts shipped with **exit 0** — with no firewall installed and a
dangling `firewall` entry still in the default runlevel.

A worse recorded instance lost **20 core packages** (`sys-libs/pam`, `sys-apps/dbus`,
`x11-libs/gtk+`, `sys-auth/polkit`, `elogind`, …) and still emitted PROD artifacts
with exit 0.

**Fix:** the payload-verification gate now fails the build on a dropped *requested*
atom. If you are on an older tree, grep the build log for `skipped` and `dropped`
before trusting an artifact.

### The `.img` has a partition table and empty partitions

The script prints `Image created` and ships an image containing a GPT table and
nothing else.

`losetup -fP` partition child nodes (`loopXp1`, `loopXp2`) are **not materialised
inside `docker run --privileged`** — the kernel scans the table, but with no udev
nothing creates the device nodes, so every write went nowhere.

**Fix:** the scripts now create the child nodes explicitly rather than relying on
`-fP`. If you see this, you are on a tree that predates that fix.

### `No space left on device` mid-`tar`, after hours of emerging

The payload exceeded the fixed `ROOT_MiB` ext4 root. Usable space is about
`ROOT_MiB × 93/100` once ext4 metadata and the 5% reserve are counted.

**Fix:** a `du -sxBM` preflight now sizes the payload *before* populating the image.
Raise `--root-size`, or let the floor calculation pick it.

### The board boots into an illegal instruction

Not a build failure — a runtime one, and the cause is upstream.

`--binpkg-respect-use=y` checks **USE only**. It never checks `CFLAGS`, `-mcpu`,
`CHOST` or the profile. Every aarch64 board shares
`CHOST=aarch64-unknown-linux-gnu` but differs in `-mcpu` (rpi5 is `cortex-a76`), so a
binary package built for one board is happily reused on another and executes an
instruction that board does not have.

**Fix:** binpkg pools are keyed per board. Never share a pool across boards by hand.

### A fix landed, and the build still fails the same way

A binary package built **before** the fix, served from a stale pool, re-breaks the
merge. One recorded build lost 143 packages to exactly this after the gettext fix had
already landed.

There is no automatic invalidation for this case.

**Fix:** delete the pool and rebuild.

## File collisions

### `gettext` / `sed` / `util-linux` fail to merge, then everything is skipped

The **host-side** gettext `.mo` collision. Because those three are BDEPENDs of nearly
everything, every subsequent atom is warn-skipped; the build grinds on for hours and
dies at the requested-atom gate. One rpi5/pki run burned about two hours before
failing.

### `grub`, `parted`, `dracut`, `cpio`, `procps`, `xfce-base` refuse to merge

The **target-side** collision — a separate, independent instance of the same defect.
One proof build **lost 143 package merges**; the log showed 4,582 literal `.mo`
install lines across 34 victim packages.

**Both sides need masking.** Fixing one leaves the other. And there is a third piece:
the stage3 seed already ships `gettext-0.23.2`, and `package.mask` only blocks
*upgrades* — so the 0.23 po infrastructure is present before any consumer runs
`eautoreconf`, and an early downgrade step is required as well.

## Container and daemon problems

### `exit 137` with nothing else in the log

The compile log just ends mid-line. This is an OOM kill, and Docker says nothing about
it on the stream — operators reasonably blame their own configuration.

The build driver now appends an explicit note when the exit code is 137, the backend
is docker, a memory cap was in force, and it was not a user-initiated stop.

**Fix:** raise the cap, or lower `--jobs`. See [the resource-limits
guide](/operations/resource-limits) for how the caps are derived.

### `docker info` fails, and the message says nothing about the cause

On Windows, Docker Desktop keeps the daemon on the Windows side and exposes it
per-WSL-distro. With integration switched off for your distro you get a connection
error that never mentions the checkbox responsible.

**Fix:** Docker Desktop → Settings → Resources → WSL integration → enable your distro.

### QEMU rows take hours instead of minutes

WSL2 disables nested virtualisation by default outside Windows 11, so `/dev/kvm` is
absent and QEMU silently falls back to TCG. Again, this reads as a hang.

### `Checking simple C program: not found`, ~40 minutes in

`qemu-aarch64` binfmt is not registered, so waf-family packages (tdb, talloc, samba,
cifs-utils) cannot run their configure probes. They are silently dropped from the
payload and surface only as a payload-incomplete assertion hours later.

**Fix:** register the binfmt handler before an ARM build:

```bash
docker run --privileged --rm tonistiigi/binfmt --install arm64
```

## Two builds at once

Sharing a binpkg pool between concurrent builds causes silent package-instance
overwrites — the target pools do not use `binpkg-multi-instance`.

Each worklist entry gets its own `BUILD_SUBDIR` for exactly this reason. If you drive
the scripts by hand, give concurrent builds separate pools.

## When none of this matches

1. **Search the build log for `skipped`, `dropped` and `WARNING`** before you trust
   an artifact. The silent-loss family is the one that wastes the most time.
2. **Check the session directory** under `out/sessions/` — each build keeps its own
   log and artifact set.
3. **Run the preflight gates directly**: `make matrix-check` runs the resolution and
   uniformity checks without starting a build, in seconds rather than hours.
