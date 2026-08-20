---
title: "Shared build config"
section: "developer-guide"
slug: "shared-build-config"
summary: "A resource-only JAR carrying the ecosystem's shared static-analysis rulesets."
source_repo: "hugmesh-build-config"
source_path: "README.md"
source_ref: "5c02b99"
---

A tiny, **resource-only JAR** that carries the HugMesh ecosystem's shared
static-analysis rulesets:

```
groupId:    net.hugmesh
artifactId: hugmesh-build-config
version:    0.5.0
packaging:  jar
```

It contains no Java — only ruleset XML under
`src/main/resources/hugmesh/`:

| File | Tool | Conventions enforced |
|------|------|----------------------|
| `pmd-ruleset.xml`     | PMD       | **A** `FinalFieldCouldBeStatic` (constants → `static final`), **B** `ImmutableField` (write-once fields → `final`) |
| `checkstyle.xml`      | Checkstyle | **F** `VisibilityModifier` (private fields), **G** `FinalClass` + `HideUtilityClassConstructor` + `MutableException` (final/utility/immutable-exception classes), **H** `LambdaBodyLength` (oversized lambda guardrail) |
| `spotbugs-include.xml`| SpotBugs core | **D** `EI_EXPOSE_REP`/`EI_EXPOSE_REP2`/`MS_EXPOSE_REP`/`MS_MUTABLE_*` (defensive copies / no rep exposure), **E** `MS_SHOULD_BE_FINAL` (no mutable static) |
| `spotbugs-include.xml`| FindSecBugs 1.14.0 | 137 of its 144 security patterns (SQL/LDAP/XPath/EL injection, path traversal, weak crypto + hard-coded keys, unsafe deserialization, XXE, SSRF, cookie/CORS/CSRF config, XSS). The other 7 currently fire and are listed, with the reason each is held back, in the file's own header. |
| `spotbugs-exclude.xml`| SpotBugs | The known-pattern **baseline**: entity/dto/model packages (EI_EXPOSE_REP/EI_EXPOSE_REP2), generated sources, and test classes. Also suppresses EI_EXPOSE_REP2 (but NOT EI_EXPOSE_REP) for Spring-managed components — matched both by component *package* and, since 0.4.0, by *class-name suffix* (`*Service`/`*Controller`/`*Repository`/`*Client`/`*Config`/`*Handler`/`*Filter`/`*Resolver`), because the fleet uses feature packages rather than layer packages. Guarded so a `byte[]`/`char[]` key or token, or a mutable collection/date, still reports even inside those classes. |

## Status

Verified this pass against the actual current code/config (not prior doc claims):

- **Resource-only jar, no Java, no `src/test`** — `find src -type f` turns up only
  the 4 XML files under `src/main/resources/hugmesh/`. There is nothing to
  unit-test here beyond the package build itself.
- **`mvn -o package` builds cleanly offline** (verified this pass) and produces
  `target/hugmesh-build-config-0.5.0.jar` containing exactly the 4 resources
  at the bare `hugmesh/<file>.xml` path the plugins expect — the distribution
  mechanism described below is real, not aspirational.
- **All three analysers (PMD, Checkstyle, SpotBugs) are in fail-mode fleet-wide**,
  confirmed by reading `hugmesh-parent`'s current `pom.xml` directly: PMD
  flipped to `pmd:check`/`failOnViolation=true` in parent commit `2363e60`,
  Checkstyle in `ef31599`, SpotBugs in `7d22f1a` (all merged 2026-06-23/24). This
  repo's own docs had drifted behind that (still said PMD/SpotBugs were
  warn-first) — corrected in this pass; see "Rollout" below.
- `EI_EXPOSE_REP2` suppression for Spring-managed component packages
  (constructor-injection false positive) has shipped since 0.3.0 and is present
  in `spotbugs-exclude.xml` — but it matched on *package path* and the fleet uses
  *feature* packages, so it caught almost nothing it was written to catch
  (measured: 4 of hugmesh-admin-bff-api's 185 injection findings). 0.4.0 adds the
  class-name-suffix rule that actually covers the intended case.
- **FindSecBugs had never reported anything.** `spotbugs-include.xml` is an
  INCLUDE filter and named only the 9 D/E patterns; FindSecBugs' 144 patterns
  share none of those names (verified against the plugin's own `findbugs.xml`),
  so every security finding was filtered out before it could be reported. 0.4.0
  admits the 137 patterns measured at zero findings fleet-wide, which turns the
  security gate on for future code at zero cost to current builds.
- No test suite, no CI badge/status page, no changelog file exist in this repo —
  not a gap, just not applicable to a 4-file resource jar; version history is the
  git log.

## Why a separate artifact (the distribution mechanism)

Static-analysis plugins resolve a ruleset from **their own plugin
classpath**, not the project's compile classpath. So `hugmesh-parent` adds
this jar to each analysis plugin's `<dependencies>` and points the plugin at
the bare classpath path `hugmesh/<file>.xml` (no `classpath:` prefix — that
prefix causes `maven-pmd-plugin`/`spotbugs-maven-plugin` to fail with
"Could not find resource"). Because the parent inherits into every Java
repo, every repo gets the same audited rulesets automatically — **no per-repo XML
copy**.

This is kept **separate from `hugmesh-commons`** (the runtime security library)
on purpose: a ruleset tweak must not force a version bump of a runtime artifact,
and build-config must not drag Spring onto any plugin classpath. It is the standard
enterprise "shared build config artifact" pattern (cf. how `google-checks`/
`sun_checks` ship inside the checkstyle jar).

```mermaid
flowchart LR
    XML["4 ruleset XML files\n(pmd-ruleset.xml, checkstyle.xml,\nspotbugs-include.xml, spotbugs-exclude.xml)"]
    JAR["hugmesh-build-config jar\n(resource-only)"]
    REG[("GitLab Maven\nPackage Registry")]
    PARENT["hugmesh-parent pom.xml\nPMD / Checkstyle / SpotBugs\nplugin wiring"]
    REPO["Each Java repo's own\nmvn verify"]
    GATE{"Any convention\nviolation?"}
    FAIL["Build fails\n(fail-mode)"]
    PASS["Build succeeds"]

    XML --> JAR
    JAR -->|"mvn deploy -s settings.xml\n(GitLab CI, default branch / tag)"| REG
    REG -->|"plugin classpath dependency\n(bare path hugmesh/*.xml)"| PARENT
    PARENT -->|"inherited by every child repo"| REPO
    REPO --> GATE
    GATE -->|yes| FAIL
    GATE -->|no| PASS
```

## Conventions mapping (the standard)

The conventions come from the org's secure/clean-Java + reactive-readability
standard. Each item maps to the most precise tool:

- **A** static-final constants → PMD `FinalFieldCouldBeStatic`
- **B** final write-once fields → PMD `ImmutableField`
- **D** defensive copies / no rep exposure → SpotBugs core `EI_EXPOSE_REP*` / `MS_EXPOSE_REP` / `MS_MUTABLE_*` (these are core patterns only — FindSecBugs does *not* reuse these names; it has its own 144-pattern namespace, admitted separately in `spotbugs-include.xml`)
- **E** mutable static → SpotBugs `MS_SHOULD_BE_FINAL`
- **F** field visibility → Checkstyle `VisibilityModifier`
- **G** final/utility/immutable-exception classes → Checkstyle `FinalClass` + `HideUtilityClassConstructor` + `MutableException`
- **H** reactive readability → Checkstyle `LambdaBodyLength` (size guardrail only)

**C** (enum for fixed string sets) and the *defensive-copy fix* / *lambda→method-ref*
/ *nesting* halves of D and H have **no reliable low-noise static rule**, so they
stay agent-pass conventions — we deliberately do not add a rule that flags every
lambda or every collection field.

## Rollout: fail-mode (all three tools)

All three analysers now run in **fail-mode** in `hugmesh-parent`: PMD (`pmd:check`, `failOnViolation=true`, flipped fleet-wide once verified clean), Checkstyle (`checkstyle:check`, `failOnViolation=true`, `severity=error` set here in `checkstyle.xml`), and SpotBugs (`spotbugs:check`, `failOnError=true` since parent PR #15). On the SpotBugs `check` goal `failOnError` is the *only* fail switch, and it gates real findings and SpotBugs-internal analysis errors together — the two are not separable, and an internal error means the gate never actually ran, so failing is correct. `failOnViolation` is **not** a parameter of that goal (it belongs to maven-pmd-plugin / maven-checkstyle-plugin); it was silently ignored, which is why the SpotBugs gate actually sat fail-**open** from `7d22f1a` until parent PR #15. Do not re-add it. A violation of any A/B/D/E/F/G/H convention now fails `mvn verify` fleet-wide. `${hugmesh.analysis.skip}` remains available in `hugmesh-parent` as an escape hatch for fast inner-loop builds.

## Building / testing locally

There is no Java to compile and no `src/test` — "testing" a ruleset change means
building the jar and re-running a consuming repo's analysis against it:

```bash
# 1. Build + install this jar into ~/.m2 so sibling repos resolve it offline.
mvn install

# 2. In a consuming repo (any Java repo that inherits hugmesh-parent),
#    re-run analysis to pick up the locally-installed jar:
mvn verify -Dhugmesh-build-config.version=<version you just installed>
```

`mvn -o package` (offline, no network) is enough to sanity-check the jar itself
builds and packages the 4 resources correctly — no external repository access is
required since this artifact has no `<dependencies>` beyond the pinned
`maven-jar-plugin`.

## Publishing

CI packages and (on the default branch / a tag) deploys the jar to the GitLab
Maven Package Registry via `mvn deploy -s settings.xml`, authenticated with the
GitLab-injected `CI_JOB_TOKEN` — **no secret committed**. There is no GitHub
Actions pipeline; CI is GitLab. For local dev, `mvn install` writes the jar to
`~/.m2` so sibling repos resolve it offline.

## Known Gaps / TODO

- None open against this repo's own backlog (checked `platform-todo-queue` and
  other session-memory notes for `build-config` / `hugmesh-build-config` /
  ruleset-related entries — no matches).
- **Fixed this pass:** the "Rollout" section and the `ROLLOUT:` header comments
  in `pmd-ruleset.xml`, `checkstyle.xml` and `spotbugs-include.xml` all still
  claimed PMD and SpotBugs ran warn-first. Reading `hugmesh-parent`'s current
  `pom.xml` directly showed all three analysers were already flipped to
  fail-mode (parent commits `2363e60`, `ef31599`, `7d22f1a`, 2026-06-23/24) —
  before even this repo's own most recent "docs sync" commits, which missed the
  drift. Corrected everywhere in this pass.
- A prior pass fixed a stale `pom.xml` comment above `<build>` that said plugins
  resolve `classpath:/hugmesh/<file>.xml`, contradicting the bare-path
  wording already correct elsewhere.
