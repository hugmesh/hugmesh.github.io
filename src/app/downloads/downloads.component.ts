import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  type ImageEntry,
  type ImageGroup,
  type Installer,
  type PackageEntry,
  type StudioRelease,
} from './release-data';
import { ReleasesService } from './releases.service';
import {
  DOWNLOAD_ARCH_LABEL,
  DOWNLOAD_ARCH_ORDER,
  DOWNLOAD_OS_LABEL,
  type DownloadArch,
  type DownloadOs,
  chooseDownload,
  detectArch,
  downloadOsFor,
  shortLabel,
} from './choose-download';
import { detectPlatform } from '../shared/platform';

export type { ImageEntry, Installer, ReleaseData, StudioRelease } from './release-data';

const OS_ORDER: readonly DownloadOs[] = ['windows', 'linux', 'other'];

const GROUPS: readonly { readonly id: ImageGroup; readonly title: string; readonly blurb: string }[] = [
  { id: 'node', title: 'Mesh node', blurb: 'Joins a machine to a mesh. Runs on any Docker host.' },
  { id: 'gateway', title: 'Gateways', blurb: 'The front doors every request passes through.' },
  { id: 'service', title: 'Services and APIs', blurb: 'The back ends behind each part of a mesh.' },
  { id: 'ui', title: 'Web apps', blurb: 'The pages people use, each served from its own image.' },
  { id: 'games', title: 'Games', blurb: 'The optional games stack.' },
];

/** Single-quote for a POSIX shell: identity regexps are full of characters a shell would eat. */
function shQuote(s: string): string {
  return `'${s.replace(/'/g, `'\\''`)}'`;
}

/**
 * The Downloads page: Studio installers and the container images.
 *
 * WHERE THE DATA COMES FROM. `assets/releases.json`, which nobody edits: the
 * Pages build writes it from the GitHub Releases API and the GHCR registry
 * (scripts/fetch-releases.mjs) on every deploy, every hour, and whenever a
 * release workflow asks. So the version numbers, file names, sizes, checksums
 * and digests on this page are whatever was actually published, and the
 * signing facts (Sigstore bundle present, provenance attested, cosign
 * signature present, MSI Authenticode-signed) are read from the release, not
 * asserted here. This page only turns those facts into sentences.
 *
 * Not fetched live from the browser: the GitHub API is rate-limited per visitor
 * IP for anonymous callers, and the registry does not answer browsers (no CORS).
 *
 * Every link is absolute (github.com / ghcr.io), so the same build works on
 * hugmesh.github.io and on the hugmesh.net mirror.
 */
@Component({
  selector: 'hug-downloads',
  imports: [RouterLink],
  templateUrl: './downloads.component.html',
  styleUrl: './downloads.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DownloadsComponent {
  private readonly releases = inject(ReleasesService);

  /** Tests set this; unset means "detect the visitor's system". */
  readonly initialOs = input<DownloadOs | null>(null);
  /** What detection actually saw: 'source' means a phone, a tablet or an unknown system. */
  private readonly detectedPlatform = detectPlatform();
  private readonly detectedOs: DownloadOs = downloadOsFor(this.detectedPlatform);
  /**
   * Tests set this; unset means "detect the machine". 'unknown' is the detector's
   * null spelled as an input: Linux with the architecture not known, both offered.
   */
  readonly initialArch = input<DownloadArch | 'unknown' | null>(null);
  /**
   * What `detectArch` found. It is asynchronous (the only honest signal is a
   * high-entropy client hint), so this starts null and the page shows both Linux
   * builds for the moment it takes, which is the right thing to show while unsure.
   */
  private readonly detectedArch = signal<DownloadArch | null>(null);
  private readonly pickedOs = signal<DownloadOs | null>(null);
  private readonly pickedArch = signal<DownloadArch | null>(null);
  readonly os = computed<DownloadOs>(() => this.pickedOs() ?? this.initialOs() ?? this.detectedOs);
  /** The Linux architecture shown: picked, else the test's, else detected; null = not known. */
  readonly arch = computed<DownloadArch | null>(() => {
    const picked = this.pickedArch();
    if (picked) return picked;
    const initial = this.initialArch();
    if (initial) return initial === 'unknown' ? null : initial;
    return this.detectedArch();
  });
  /** True while the shown system is the detected guess, so the page can say so. */
  readonly osIsGuess = computed(() => this.pickedOs() === null && this.initialOs() === null);
  /** True while the shown architecture (or the lack of one) is the detector's, not the visitor's pick. */
  readonly archIsGuess = computed(() => this.pickedArch() === null && this.initialArch() === null);
  /** The sentence about the guess. A phone is told plainly that Studio is a desktop app. */
  readonly guessText = computed(() => {
    const os = this.os();
    if (os === 'linux') {
      const arch = this.arch();
      return arch
        ? `This looks like Linux on ${DOWNLOAD_ARCH_LABEL[arch]}.`
        : 'This looks like Linux, and the browser does not say whether the machine is x86_64 or ARM64, so both builds are offered.';
    }
    if (os !== 'other') return `This looks like ${DOWNLOAD_OS_LABEL[os]}.`;
    return this.detectedPlatform === 'macos'
      ? 'This looks like macOS.'
      : 'Studio is a desktop app, and this does not look like Windows or Linux (a phone or tablet, perhaps).';
  });
  readonly osOrder = OS_ORDER;
  readonly osLabel = DOWNLOAD_OS_LABEL;
  readonly archOrder = DOWNLOAD_ARCH_ORDER;
  readonly archLabel = DOWNLOAD_ARCH_LABEL;
  readonly shortLabel = shortLabel;

  constructor() {
    void detectArch().then((arch) => this.detectedArch.set(arch));
  }

  readonly copied = signal<string | null>(null);

  private readonly loaded = this.releases.loaded;

  readonly state = computed(() => this.loaded().state);
  readonly data = computed(() => {
    const l = this.loaded();
    return l.state === 'ready' ? l.data : null;
  });
  readonly studio = computed(() => this.data()?.studio ?? null);
  readonly studioRepo = computed(() => this.data()?.studioRepo ?? 'hugmesh/hugmesh-generator');
  readonly archive = computed(() => this.data()?.studioArchive ?? []);

  readonly choice = computed(() => chooseDownload(this.os(), this.studio()?.installers ?? [], this.arch()));

  readonly windows = computed(() => (this.studio()?.installers ?? []).filter((i) => i.platform === 'windows'));
  readonly linux = computed(() => (this.studio()?.installers ?? []).filter((i) => i.platform === 'linux'));

  readonly imageGroups = computed(() => {
    const images = this.data()?.images ?? [];
    return GROUPS.map((g) => ({ ...g, items: images.filter((i) => i.group === g.id) })).filter(
      (g) => g.items.length > 0,
    );
  });
  readonly publishedImageGroups = computed(() =>
    this.imageGroups()
      .map((g) => ({ ...g, items: g.items.filter((i) => i.version) }))
      .filter((g) => g.items.length > 0),
  );
  readonly unpublishedImages = computed(() => (this.data()?.images ?? []).filter((i) => !i.version));
  readonly imagesPublished = computed(() => (this.data()?.images ?? []).filter((i) => i.version).length);
  readonly imagesTotal = computed(() => (this.data()?.images ?? []).length);

  readonly packages = computed(() => this.data()?.packages ?? []);
  readonly repos = computed(() => this.data()?.repos ?? []);

  /** When the build last asked GitHub and the registry. */
  readonly checkedAt = computed(() => {
    const g = this.data()?.generated;
    return g ? new Date(g).toUTCString().replace('GMT', 'UTC') : null;
  });

  chooseOs(os: DownloadOs): void {
    this.pickedOs.set(os);
  }

  chooseArch(arch: DownloadArch): void {
    this.pickedArch.set(arch);
  }

  /** "Linux" or "Linux ARM64 (aarch64)": the big button names the architecture it is for. */
  buttonTarget(i: Installer): string {
    return i.platform === 'linux' ? `Linux ${DOWNLOAD_ARCH_LABEL[i.arch]}` : DOWNLOAD_OS_LABEL[this.os()];
  }

  /** The one verify line under the big button, for the file it downloads. */
  quickVerify(i: Installer): string {
    return i.platform === 'windows'
      ? `(Get-FileHash .\\${i.file} -Algorithm SHA256).Hash`
      : `sha256sum ${i.file}`;
  }

  repoUrl(repo: string): string {
    return `https://github.com/${repo}`;
  }

  releasesUrl(repo: string): string {
    return `https://github.com/${repo}/releases`;
  }

  /** The image's page on GitHub Packages; it exists only once something is published. */
  ghcrUrl(i: ImageEntry): string {
    const [, owner, ...rest] = i.image.split('/');
    return `https://github.com/orgs/${owner}/packages/container/package/${encodeURIComponent(rest.join('/'))}`;
  }

  /** A Maven repository's packages on GitHub. */
  packagesUrl(p: PackageEntry): string {
    return `https://github.com/${p.repo}/packages`;
  }

  /** The POM lines that use a released library: <parent> for the parent POM, <dependency> otherwise. */
  mavenSnippet(p: PackageEntry): string {
    const tag = p.packaging === 'pom' ? 'parent' : 'dependency';
    const repoName = p.repo.split('/')[1];
    return [
      `<${tag}>`,
      `  <groupId>${p.groupId}</groupId>`,
      `  <artifactId>${p.artifactId}</artifactId>`,
      `  <version>${p.version}</version>`,
      `</${tag}>`,
      '',
      '<!-- in <repositories> -->',
      '<repository>',
      `  <id>github-${repoName}</id>`,
      `  <url>https://maven.pkg.github.com/${p.repo}</url>`,
      '</repository>',
    ].join('\n');
  }

  /** One honest line about a Studio release: what is signed, and what is not. */
  studioStatus(s: StudioRelease): string {
    const parts: string[] = [];
    const files = s.installers.length;
    const attested = s.installers.filter((i) => i.attested).length;
    parts.push(s.prerelease ? 'Beta: expect rough edges and changes between betas.' : 'Release.');
    if (files === 0) {
      parts.push('This release has no installers attached.');
    } else if (attested === files) {
      parts.push('GitHub Actions build provenance is attested for every file.');
    } else if (attested > 0) {
      parts.push(`Build provenance is attested for ${attested} of ${files} files.`);
    } else {
      parts.push('No build provenance attestation was found for these files.');
    }
    parts.push(
      s.checksumsSignature
        ? 'SHA256SUMS is signed with Sigstore (cosign, keyless).'
        : 'SHA256SUMS carries no Sigstore signature.',
    );
    if (s.installers.some((i) => i.kind === 'msi')) {
      parts.push(
        s.authenticode
          ? 'The Windows MSI is Authenticode-signed.'
          : 'The Windows MSI is not Authenticode-signed yet, so Windows SmartScreen will warn before it runs.',
      );
    }
    return parts.join(' ');
  }

  /** One honest line about an image. */
  imageStatus(i: ImageEntry): string {
    if (!i.version) return 'Not published yet, or not public yet.';
    const head = i.prerelease ? 'Beta.' : 'Release.';
    const sig = i.signed ? 'Signed with cosign' : 'No cosign signature found';
    const prov = i.attested ? 'build provenance attested' : 'no provenance attestation found';
    return `${head} ${sig}; ${prov}.`;
  }

  pull(i: ImageEntry): string {
    return `docker pull ${i.image}:${i.version}`;
  }

  cosignImage(i: ImageEntry): string {
    return [
      `cosign verify ${i.image}@${i.digest}`,
      `  --certificate-identity-regexp ${shQuote(i.identity.regexp)}`,
      `  --certificate-oidc-issuer ${i.identity.issuer}`,
    ].join(' \\\n');
  }

  attestImage(i: ImageEntry): string {
    return `gh attestation verify oci://${i.image}@${i.digest} --repo ${i.repo}`;
  }

  verifyImage(i: ImageEntry): string {
    return `${this.cosignImage(i)}\n${this.attestImage(i)}`;
  }

  /** Checksums first, then (when the release has a bundle) the signature on the checksum list. */
  sumsScript(s: StudioRelease): string {
    const lines: string[] = [];
    if (s.checksums) lines.push('sha256sum --ignore-missing -c SHA256SUMS');
    else lines.push('# This release has no SHA256SUMS: compare each file with the SHA-256 shown above.');
    if (s.checksums && s.checksumsSignature) {
      lines.push(
        [
          'cosign verify-blob SHA256SUMS',
          `  --bundle ${s.checksumsSignature.file}`,
          `  --certificate-identity-regexp ${shQuote(s.identity.regexp)}`,
          `  --certificate-oidc-issuer ${s.identity.issuer}`,
        ].join(' \\\n'),
      );
    }
    return lines.join('\n');
  }

  attestScript(s: StudioRelease): string {
    return s.installers.map((i: Installer) => `gh attestation verify ${i.file} --repo ${s.repo}`).join('\n');
  }

  hashMsi(i: Installer): string {
    return `Get-FileHash .\\${i.file} -Algorithm SHA256`;
  }

  shortDigest(d: string | null): string {
    return d ? `${d.slice(0, 19)}…` : '';
  }

  /** Copying is the point of showing a checksum or a command: nobody selects 64 hex characters by hand. */
  async copy(text: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(text);
      this.copied.set(text);
      setTimeout(() => this.copied.update((v) => (v === text ? null : v)), 2500);
    } catch {
      // Clipboard access can be denied outright; the value is on screen anyway.
    }
  }
}
