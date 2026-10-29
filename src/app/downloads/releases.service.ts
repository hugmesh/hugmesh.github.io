import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { toSignal } from '@angular/core/rxjs-interop';
import { catchError, map, of } from 'rxjs';
import { type ReleaseData, validateReleaseData } from './release-data';

export type LoadedReleases =
  | { readonly state: 'loading' }
  | { readonly state: 'missing' }
  | { readonly state: 'invalid'; readonly errors: readonly string[] }
  | { readonly state: 'ready'; readonly data: ReleaseData };

/**
 * assets/releases.json, fetched once per visit and shared: the header-less home
 * page call to action and the Downloads page read the same answer, so they can
 * never disagree about which version is current. The file is validated with the
 * same function the build ran; a file that fails is "invalid", never half-shown.
 */
@Injectable({ providedIn: 'root' })
export class ReleasesService {
  private readonly http = inject(HttpClient);

  readonly loaded = toSignal(
    this.http.get<unknown>('assets/releases.json').pipe(
      map((raw): LoadedReleases => {
        const errors = validateReleaseData(raw);
        return errors.length ? { state: 'invalid', errors } : { state: 'ready', data: raw as ReleaseData };
      }),
      catchError(() => of<LoadedReleases>({ state: 'missing' })),
    ),
    { initialValue: { state: 'loading' } as LoadedReleases },
  );
}
