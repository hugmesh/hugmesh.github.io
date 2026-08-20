import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  InjectionToken,
  OnDestroy,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import {
  BackgroundEffectId,
  VantaEffectLoader,
  VantaInstance,
  loadVantaEffect,
  webglAvailable,
} from './vanta-effects';

export const VANTA_EFFECT_LOADER = new InjectionToken<VantaEffectLoader>('VANTA_EFFECT_LOADER', {
  providedIn: 'root',
  factory: () => loadVantaEffect,
});

export const VANTA_WEBGL_PROBE = new InjectionToken<() => boolean>('VANTA_WEBGL_PROBE', {
  providedIn: 'root',
  factory: () => webglAvailable,
});

/** Where the reader's pause choice is remembered between visits. */
const PAUSE_KEY = 'hug-docs-bg-paused';

/**
 * The site's decorative backdrop: a CSS gradient wash (background.component.scss)
 * with an optional three.js/Vanta layer on top.
 *
 * DEGRADATION IS THE DESIGN. The CSS wash is painted before any of this class
 * runs, and every path that can fail — reduced motion, no WebGL, a chunk that
 * will not load, an init that throws, a reader who pressed pause — lands back on
 * it. There is no state in which the backdrop is blank.
 */
@Component({
  selector: 'hug-background',
  templateUrl: './background.component.html',
  styleUrl: './background.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BackgroundComponent implements AfterViewInit, OnDestroy {
  private readonly loader = inject(VANTA_EFFECT_LOADER);
  private readonly hasWebgl = inject(VANTA_WEBGL_PROBE);

  private readonly host = viewChild.required<ElementRef<HTMLElement>>('canvas');

  /** The effect layer, once it exists. Null covers "not started", "refused" and
   *  "torn down" alike — nothing else needs to tell those apart. */
  private instance: VantaInstance | null = null;
  /** Bumped on every start/stop so a load that resolves AFTER a teardown knows
   *  it is stale and destroys itself instead of attaching to a dead element. */
  private generation = 0;

  readonly paused = signal(readPaused());

  private readonly effect: BackgroundEffectId = 'fog';

  ngAfterViewInit(): void {
    if (!this.paused()) void this.start();
  }

  ngOnDestroy(): void {
    this.stop();
  }

  /** Reader-facing pause/play. The choice persists, because a reader who turns
   *  the animation off wants it off on the next page too, not just this one. */
  toggle(): void {
    const next = !this.paused();
    this.paused.set(next);
    writePaused(next);
    if (next) this.stop();
    else void this.start();
  }

  private async start(): Promise<void> {
    if (this.instance) return;
    if (prefersReducedMotion()) return;
    if (!this.hasWebgl()) return;

    const token = ++this.generation;
    let loaded;
    try {
      loaded = await this.loader(this.effect);
    } catch {
      return; // The CSS wash is already on screen; nothing to report.
    }
    if (token !== this.generation) return;

    // Vanta drives its own requestAnimationFrame loop. Under zone.js that would
    // have needed runOutsideAngular to avoid a change-detection pass per frame;
    // the app is ZONELESS, so nothing patches rAF and the loop is already
    // invisible to change detection.
    try {
      this.instance = loaded.factory({
        el: this.host().nativeElement,
        THREE: loaded.three,
        mouseControls: false,
        touchControls: false,
        gyroControls: false,
        minHeight: 200,
        minWidth: 200,
        highlightColor: 0x7c4dff,
        midtoneColor: 0x3a2a6b,
        lowlightColor: 0x12121e,
        baseColor: 0x0a0a0a,
        blurFactor: 0.62,
        speed: 0.8,
        zoom: 0.9,
      });
    } catch {
      this.instance = null;
    }
  }

  private stop(): void {
    this.generation += 1;
    const live = this.instance;
    this.instance = null;
    try {
      live?.destroy();
    } catch {
      /* a context already lost throws on destroy; nothing left to clean up */
    }
  }
}

function prefersReducedMotion(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** Storage access is wrapped: a browser in "block all cookies" mode THROWS on
 *  localStorage rather than returning null, and a decorative preference must
 *  never be able to break the page. */
function readPaused(): boolean {
  try {
    return localStorage.getItem(PAUSE_KEY) === '1';
  } catch {
    return false;
  }
}

function writePaused(value: boolean): void {
  try {
    localStorage.setItem(PAUSE_KEY, value ? '1' : '0');
  } catch {
    /* preference simply does not persist */
  }
}
