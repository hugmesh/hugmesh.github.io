---
title: "Troubleshooting builds"
section: "troubleshooting"
slug: "build-failures"
summary: "A symptom-first index of real HugMesh build failures — the exact error text, what actually caused it, and the fix."
---

Look up what you **see**, not what you think went wrong. One root cause shows up as three
different failures, depending on which gate catches it first. So this page is organised by
symptom.

Every entry below is a failure this project has seen. The error text is quoted as it
appears.

> **Before you dig in:** nearly every guard in the build scripts is a tombstone for one of
> these. If a build stops in the first minute with a clear message, a preflight is doing
> its job. The fix is usually in the message.

## The build "hung"

### The desktop froze and the machine rebooted

A dockerized **fleet** build compiled llvm's 32-bit multilib pass at `-j8` inside an
**unbounded** container. The desktop had 31 GiB of RAM, a browser and an IDE open, and 4
GiB of swap that was already full. From the operator's chair the desktop simply died.

**Fix:** cap the builder. Studio → tray → **Resource limits**, or set the variables in the
environment of the Studio, which builds the `docker run` command:

```bash
HUGMESH_BUILD_MEMORY=16g HUGMESH_CPUS=6 ./hugmesh-studio
```

The builder scripts and `make build-all` do not read these variables. Only the Studio adds
`--memory`, `--memory-swap` and `--cpus` to the container. A capped container OOMs, which
is an honest build failure, instead of taking the host with it. `--memory-swap` is pinned
equal to `--memory`, so a runaway compile cannot thrash the host's swap. That was the
incident's signature.

### The build is 10–20× slower than it should be, with no error

Your checkout is on a Windows drive, reached from WSL2 over 9p/virtiofs. Every `open()`,
`stat()` and `rename()` leaves the VM, and a build makes hundreds of thousands of them.

It does not look like slowness. It looks like **"the build hung"**. Nothing errors, so
nothing explains it.

**Fix:** move the checkout inside the WSL2 filesystem (`~/`, not `/mnt/c/`). The Studio
detects this by reading the filesystem *type* from `/proc/mounts`, not by matching the
path. A bind mount or a symlink into `/mnt/c` looks like a Linux path and is just as slow.

### Logs are enormous

```
[WARNING] _do_sendfile failed unexpectedly
OSError: [Errno 22] Invalid argument   (portage/util/file_copy.py:89)
```

Repeated; one recorded log has it **150,692 times**. Your work directory is on eCryptfs
(`/home/.Private`), which cannot take `sendfile(2)` writes. This is noise, not a failure:
portage falls back to `shutil` and every copy completes.

**Fix:** none needed. The builder patches portage's `file_copy.py` to silence the warning
(`scripts/patch-portage-file-copy.py`). To remove the cause, move the work directory off
eCryptfs.

### `File name too long` during a Go build

kubelet, runc, cni-plugins and containerd have deeply vendored cache paths. eCryptfs caps
filenames at roughly **143 characters**.

**Fix:** the x86 builder detects eCryptfs from `df -T` and binds the chroot's
`/var/tmp/portage` onto a host xfs scratch directory. Driving the scripts directly? Keep
the work directory off eCryptfs.

## The build died with a resolution wall

### `emerge: there are no ebuilds built with USE flags to satisfy …`

```
emerge: there are no ebuilds built with USE flags to satisfy ">=dev-libs/glib-2.82.0:2[introspection]"
!!! One of the following packages is required to complete your request:
- dev-libs/glib-2.88.2::gentoo (Change USE: +introspection)
```

A **global USE mask** in `make.conf.tmpl` made a requested atom unresolvable. The recorded
case was `firewalld` on rpi5, which needs `glib[introspection]` against a global
`USE=-introspection`.

**Fix:** add a *scoped* override, here `dev-libs/glib introspection` in the platform's
`package.use`, rather than dropping the global mask. For this case the override was tried
and retired: glib-2.88.2's introspection bootstrap dies in `src_configure` on a cross
build. So `specs-rpi5` leaves `net-firewall/firewalld` out on purpose (see the
`DELIBERATELY EXCLUDED` block in `packages.list`); `nftables` carries the firewall. The
gate `tests/requested-atoms-resolvable.sh` (run by `make matrix-check`) catches this class
before the build starts:

```
FAIL [rpi5] requested atom net-firewall/firewalld is UNRESOLVABLE: global USE=-introspection
(make.conf.tmpl) with no scoped package.use 'dev-libs/glib introspection' override — chain: …
```

### `Multiple package instances within a single package slot … slot conflict`

```
!!! Multiple package instances within a single package slot have been pulled
into the dependency graph, resulting in a slot conflict: dev-python/requests:0
```

`PYTHON_TARGETS` REPLACE-vs-ADD. `PYTHON_TARGETS` assigned in `make.conf` replaces the
profile default. The same value in `package.use` adds to it. A frozen `python3_12` literal
in `make.conf.tmpl` forced the payload onto an interpreter the seed did not have. The
seed's own `sys-apps/portage` kept demanding `python3_13` and `python3_14` from the same
`dev-python/*` slots. Result: two instances of one slot.

### `The following USE changes are necessary to proceed: … python_targets_python3_12`

The mirror image: the seed shipped portage built with the *other* Python target. Pinning
to a single version flips the other flag off on rebuilds and wedges the tree.

**Fix for both:** `PYTHON_TARGETS` must be a superset of the targets the seed's installed
packages were built with. Derive it from the seed at build time; never freeze it as a
literal. All ten builders now do this (`scripts/_python-targets-lib.sh`). If you hit these
walls on a tree with a `PYTHON_TARGETS="python3_NN"` literal in `make.conf.tmpl`, that
literal is the cause. The root-cause analysis is in the generator's
[`docs/PYTHON-TARGETS-SEED-DRIFT.md`](/troubleshooting/python-targets-seed-drift).

### `masked by: ~amd64 keyword` on a cross build, but only the host half

The cross-emerge resolves **BDEPENDs against the container's own amd64 `/etc/portage`**,
not the target's. Per-platform `package.accept_keywords` under `specs-*/portage/` covers
the sysroot side and does nothing for the host side.

**Fix:** pre-seed the *host* `package.accept_keywords` / `package.use` for the build-time
dependency. This is the most common cross-build wall. The rpi5 builder does it for the
known case (`dev-python/vcs-versioning`); a new case needs the same pre-seed.

### `configure: error: C compiler cannot create executables`

Something tried to cross-*rebuild the toolchain itself*. Target gcc, glibc and binutils
cannot be built this way, because the build must run freshly built target binaries on the
x86 host.

**Fix:** the payload emerge carries `--exclude sys-devel/gcc` (with `gcc-config`, `glibc`
and `binutils`) unless you set `REBUILD_TOOLCHAIN=true`, which usually fails. If you
invoke emerge by hand, keep those exclusions.

### `<tool> not found in PATH` in the first minute

No cross toolchain. ARM targets (`rpi5`, `frite`, `jetson`, `orangepi*`) need
`aarch64-unknown-linux-gnu-gcc`.

```bash
crossdev --stable --target aarch64-unknown-linux-gnu
```

Or use a builder image built with `CROSSDEV=1`, which `make docker-image` does by default
(`CROSSDEV=0` makes an x86-only image).

## The build "succeeded" but the image is wrong

This family is the dangerous one: **exit code 0, artifacts produced, something missing**.
Check here whenever a built image misbehaves.

### A package you asked for is simply absent

```
WARNING: skipped net-firewall/firewalld
…
Stage4 payload verified (…)
```

`--keep-going` dropped a requested atom and the build carried on. All three `.img.xz`
artifacts shipped with **exit 0**, with no firewall installed and a dangling `firewall`
entry in the default runlevel.

A worse recorded case lost **20 core packages** (`sys-libs/pam`, `sys-apps/dbus`,
`x11-libs/gtk+`, `sys-auth/polkit`, `elogind`, …) and still emitted PROD artifacts with
exit 0.

**Fix:** the requested-atom completeness gate now fails the build on a dropped *requested*
atom (`ALLOW_MISSING_PACKAGES=false`; `--allow-missing-packages` accepts a degraded image
on purpose). On x86 an emerge failure-notice gate also fails the build when a *dependency*
was dropped. On an older tree, grep the build log for `skipped` and `dropped` before you
trust an artifact.

### The `.img` has a partition table and empty partitions

The script prints `Image created` and ships an image holding a GPT table and nothing else.

`losetup -fP` partition child nodes (`loopXp1`, `loopXp2`) are **not materialised inside
`docker run --privileged`**. The kernel scans the table, but with no udev nothing creates
the device nodes, so every write went nowhere.

**Fix:** the scripts no longer rely on `-fP`. The x86 builder pre-creates a pool of
`/dev/loopN` nodes and maps each partition with its own offset loop device
(`losetup --offset … --sizelimit …`). The rpi5 builder creates the `loopXpN` nodes with
`mknod`. If you see this, your tree predates the fix.

### `No space left on device` mid-`tar`, after hours of emerging

The payload exceeded the fixed `ROOT_MiB` ext4 root. Usable space is about
`ROOT_MiB × 93/100` once ext4 metadata and the 5% reserve are counted.

**Fix:** a `du -sxBM` preflight now sizes the payload *before* it populates the image. The
x86 builder then grows the root to fit (payload plus about 15%, rounded up to a GiB) and
warns. The rpi5 builder stops and prints the `--img-size` (in MiB) to use. There is no
`--root-size` flag; the Studio's root-size floor feeds `--img-size`.

### The board boots into an illegal instruction

Not a build failure but a runtime one, and the cause is upstream.

`--binpkg-respect-use=y` checks **USE only**. It never checks `CFLAGS`, `-mcpu`, `CHOST`
or the profile. Every aarch64 board shares `CHOST=aarch64-unknown-linux-gnu` but differs
in `-mcpu` (rpi5 is `cortex-a76`). So a binary package built for one board is reused on
another and executes an instruction that board does not have.

**Fix:** binpkg pools are keyed per board (`BUILD_SUBDIR`). A fingerprint guard
(`scripts/_binpkg-pool-lib.sh`) stamps each pool with CHOST, CFLAGS, CXXFLAGS and profile,
and refuses `--usepkg` reuse when they differ. Never point two boards at one pool by hand.

### A fix landed, and the build still fails the same way

A binary package built **before** the fix, served from a stale pool, breaks the merge
again. One recorded build lost 143 packages this way after the gettext fix had already
landed.

Nothing invalidates the pool automatically (no `eclean` on a pin change).

**Fix:** delete the pool (`rm -rf <pkgdir>`) and rebuild. Or change the pool fingerprint's
`salt`, so the guard forces a rebuild (`docs/SHARED-BINPKG.md`, invalidation rule 2).

## File collisions

### `gettext` / `sed` / `util-linux` fail to merge, then everything is skipped

The **host-side** gettext `.mo` collision. Those three are BDEPENDs of nearly everything,
so every later atom is warn-skipped. The build grinds on for hours and dies at the
requested-atom gate. One rpi5/pki run burned about two hours before it failed.

### `grub`, `parted`, `dracut`, `cpio`, `procps`, `xfce-base` refuse to merge

The **target-side** collision: a separate, independent instance of the same defect. One
proof build **lost 143 package merges**. The log showed 4,582 literal `.mo` install lines
across 34 victim packages.

The cause is `gettext-0.23.2` miscomputing `$(DOMAIN)`. Every autotools-NLS package
installs a file literally named `/usr/share/locale/<lang>/LC_MESSAGES/.mo`. Two packages
claim one path, and collision-protect refuses the whole merge.

**Both sides need masking.** Fixing one leaves the other. Both are in every builder now,
and `studio/tests/test_builder_mo_collision.py` pins them. There is a third piece. The
stage3 seed already ships `gettext-0.23.2`, and `package.mask` blocks only *upgrades*. So
the 0.23 po infrastructure is present before any consumer runs `eautoreconf`, and an early
downgrade step is needed as well.

## Container and daemon problems

### `exit 137` with nothing else in the log

The compile log just ends mid-line. This is an OOM kill. Docker says nothing about it on
the stream, so operators reasonably blame their own configuration.

The build driver now appends an explicit note when the exit code is 137, the backend is
docker, a memory cap was in force, and the stop was not user-initiated.

**Fix:** raise the cap, or lower `-j`/`--jobs`. See [the resource-limits
guide](/operations/resource-limits) for how the caps are derived.

### `docker info` fails, and the message says nothing about the cause

On Windows, Docker Desktop keeps the daemon on the Windows side and exposes it per WSL
distro. With integration switched off for your distro you get a connection error that
never mentions the checkbox responsible.

**Fix:** Docker Desktop → Settings → Resources → WSL integration → enable your distro.

### QEMU rows take hours instead of minutes

WSL2 disables nested virtualisation by default outside Windows 11, so `/dev/kvm` is absent
and QEMU silently falls back to TCG. Again, this reads as a hang.

**Fix:** in `%UserProfile%\.wslconfig` set `[wsl2]` `nestedVirtualization=true`, run
`wsl --shutdown` from PowerShell, and reopen the distro. WSL1 cannot run KVM at all;
convert the distro with `wsl --set-version <distro> 2`.

### `Checking simple C program: not found`, ~40 minutes in

`qemu-aarch64` binfmt is not usable in the build container. Waf-family packages (tdb,
talloc, samba, cifs-utils) then cannot run their configure probes. On older trees they
were dropped from the payload without a word and surfaced only as a payload-incomplete
assertion hours later. The ARM builders now check at the start, and refuse when the
resolved package set contains one of those packages:

```
… build by EXECUTING cross-compiled test binaries (waf configure …) but qemu-aarch64 is
unusable in THIS container …
```

**Fix:** use a builder image that ships a static `qemu-aarch64` (`make docker-image`) and
run it in a `--privileged` container. The builder then registers the handler itself. Where
that is not possible, registering it outside the container may work:

```bash
docker run --privileged --rm tonistiigi/binfmt --install arm64
```

## Two builds at once

Two concurrent builds sharing a binpkg pool overwrite each other's package instances. The
target pools do not use `binpkg-multi-instance`.

There is one pool per board, held under an exclusive `flock` on `<pool>.writer.lock`. A
second concurrent build of the same board is refused with `another build is already writing
the shared binpkg pool`. Wait for the other build, or pass `--no-shared-assets` for a
private pool. The build scratch directory is locked the same way.

## When none of this matches

1. **Search the build log for `skipped`, `dropped` and `WARNING`** before you trust an
   artifact. The silent-loss family wastes the most time.
2. **Check the session directory** under `out/sessions/`. Each build keeps its own log and
   artifact set.
3. **Run the preflight gates directly.** `make matrix-check` validates the whole build
   matrix through `--print-plan` without starting a build. It takes minutes, not hours
   (one run here: 2 min 48 s, 1297 checks passed).
