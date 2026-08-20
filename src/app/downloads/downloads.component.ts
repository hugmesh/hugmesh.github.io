import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { catchError, map, of } from 'rxjs';

/** One published installer, as recorded in assets/releases.json. */
export interface Installer {
  readonly platform: 'windows' | 'linux';
  readonly kind: string;
  readonly label: string;
  readonly file: string;
  readonly url: string;
  readonly size: string;
  readonly sha256: string;
  readonly notes: string;
}

export interface ReleaseInfo {
  readonly version: string;
  readonly published: string;
  readonly notesUrl: string | null;
  readonly installers: readonly Installer[];
}

/**
 * The Studio download page.
 *
 * The release data is a static `assets/releases.json`, refreshed by the release
 * workflow rather than fetched live from the GitHub API. Two reasons: the API is
 * rate-limited per client IP for anonymous callers, and hugmesh-generator is a
 * PRIVATE repo, so an anonymous browser cannot read its releases at all. A file
 * the release job writes is the only version of this that works for a visitor.
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

  private readonly release = toSignal(
    this.http.get<ReleaseInfo>('assets/releases.json').pipe(
      catchError(() => of(null)),
      map((r): ReleaseInfo | null | undefined => r),
    ),
    { initialValue: undefined },
  );

  readonly loading = computed(() => this.release() === undefined);
  readonly info = computed(() => this.release() ?? null);

  readonly windows = computed(() =>
    (this.info()?.installers ?? []).filter((i) => i.platform === 'windows'),
  );
  readonly linux = computed(() =>
    (this.info()?.installers ?? []).filter((i) => i.platform === 'linux'),
  );

  /** Copying a checksum is the point of showing one — asking someone to select
   *  64 hex characters by hand is how verification stops happening. */
  async copy(sha: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(sha);
      this.copied.set(sha);
      setTimeout(() => this.copied.update((v) => (v === sha ? null : v)), 2500);
    } catch {
      // Clipboard access can be denied outright; the value is on screen anyway.
    }
  }
}
