import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { catchError, map, of } from 'rxjs';
import {
  type ImageEntry,
  type ImageGroup,
  type Installer,
  type ReleaseData,
  type StudioRelease,
  validateReleaseData,
} from './release-data';

export type { ImageEntry, Installer, ReleaseData, StudioRelease } from './release-data';

type Loaded =
  | { readonly state: 'loading' }
  | { readonly state: 'missing' }
  | { readonly state: 'invalid'; readonly errors: readonly string[] }
  | { readonly state: 'ready'; readonly data: ReleaseData };

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
  private readonly http = inject(HttpClient);

  readonly copied = signal<string | null>(null);

  private readonly loaded = toSignal(
    this.http.get<unknown>('assets/releases.json').pipe(
      map((raw): Loaded => {
        const errors = validateReleaseData(raw);
        return errors.length ? { state: 'invalid', errors } : { state: 'ready', data: raw as ReleaseData };
      }),
      catchError(() => of<Loaded>({ state: 'missing' })),
    ),
    { initialValue: { state: 'loading' } as Loaded },
  );

  readonly state = computed(() => this.loaded().state);
  readonly data = computed(() => {
    const l = this.loaded();
    return l.state === 'ready' ? l.data : null;
  });
  readonly studio = computed(() => this.data()?.studio ?? null);
  readonly studioRepo = computed(() => this.data()?.studioRepo ?? 'hugmesh/hugmesh-generator');

  readonly windows = computed(() => (this.studio()?.installers ?? []).filter((i) => i.platform === 'windows'));
  readonly linux = computed(() => (this.studio()?.installers ?? []).filter((i) => i.platform === 'linux'));

  readonly imageGroups = computed(() => {
    const images = this.data()?.images ?? [];
    return GROUPS.map((g) => ({ ...g, items: images.filter((i) => i.group === g.id) })).filter(
      (g) => g.items.length > 0,
    );
  });
  readonly imagesPublished = computed(() => (this.data()?.images ?? []).filter((i) => i.version).length);
  readonly imagesTotal = computed(() => (this.data()?.images ?? []).length);

  /** When the build last asked GitHub and the registry. */
  readonly checkedAt = computed(() => {
    const g = this.data()?.generated;
    return g ? new Date(g).toUTCString().replace('GMT', 'UTC') : null;
  });

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

  /** Checksums first, then (when the release has a bundle) the signature on the checksum list. */
  sumsScript(s: StudioRelease): string {
    const lines = ['sha256sum --ignore-missing -c SHA256SUMS'];
    if (s.checksumsSignature) {
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
