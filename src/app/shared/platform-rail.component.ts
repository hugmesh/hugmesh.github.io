import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  PLATFORM_OFFERS,
  PLATFORM_ORDER,
  type PlatformId,
  detectPlatform,
} from './platform';

/**
 * "Here is the build for your machine" — the one thing the front door owes a
 * first-time visitor.
 *
 * IT LEADS WITH A GUESS AND SAYS SO. The detected platform is shown first and
 * labelled `detected`; every other platform stays visible as a one-click switch.
 * A wrong guess therefore costs a click, and never strands anyone on install
 * notes for an OS they are not running.
 *
 * IT DOES NOT PROMISE A DOWNLOAD. No Studio release is published yet, so the
 * rail offers the install path that works today and routes to the full notes.
 * `packaged` distinguishes "there is an installer for this platform" from "you
 * can run it here at all" — macOS has no packaged build and the rail says so
 * rather than implying one is coming.
 *
 * Extracted from HomeComponent because /downloads wants the same object, and
 * because a page that has to style it twice is a page whose styles drift.
 */
@Component({
  selector: 'hug-platform-rail',
  imports: [RouterLink],
  templateUrl: './platform-rail.component.html',
  styleUrl: './platform-rail.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PlatformRailComponent {
  /** Set only by tests and by /downloads, which may deep-link a platform.
   *  Unset means "detect it". */
  readonly initial = input<PlatformId | null>(null);

  private readonly detected: PlatformId = detectPlatform();
  private readonly picked = signal<PlatformId | null>(null);

  readonly platform = computed<PlatformId>(
    () => this.picked() ?? this.initial() ?? this.detected,
  );
  readonly offer = computed(() => PLATFORM_OFFERS[this.platform()]);

  /** True while the shown platform is still the detected guess, so the label can
   *  say `detected` rather than `selected`. */
  readonly isGuess = computed(() => this.picked() === null && this.initial() === null);

  readonly otherPlatforms = computed(() =>
    PLATFORM_ORDER.filter((p) => p !== this.platform()).map((p) => PLATFORM_OFFERS[p]),
  );

  choose(id: PlatformId): void {
    this.picked.set(id);
  }
}
