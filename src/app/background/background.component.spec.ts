import { ComponentFixture, TestBed } from '@angular/core/testing';
import {
  BackgroundComponent,
  VANTA_EFFECT_LOADER,
  VANTA_WEBGL_PROBE,
} from './background.component';
import { LoadedVantaEffect, VantaInstance } from './vanta-effects';

/**
 * The backdrop's contract is that it NEVER breaks the page. These specs drive
 * every refusal path — no WebGL, a loader that rejects, a factory that throws,
 * a reader who paused it — and assert the component survives each one, because
 * a decorative layer taking the site down with it is the only real failure mode
 * it has.
 */
describe('BackgroundComponent', () => {
  let fixture: ComponentFixture<BackgroundComponent>;
  let destroyed: number;
  let created: number;
  let loaderCalls: number;

  const instance = (): VantaInstance => ({
    destroy: () => {
      destroyed += 1;
    },
  });

  function configure(options: {
    webgl?: boolean;
    loader?: () => Promise<LoadedVantaEffect>;
  }): void {
    const loader = options.loader ??
      (async (): Promise<LoadedVantaEffect> => ({
        three: {},
        factory: () => {
          created += 1;
          return instance();
        },
      }));

    TestBed.configureTestingModule({
      imports: [BackgroundComponent],
      providers: [
        { provide: VANTA_WEBGL_PROBE, useValue: () => options.webgl ?? true },
        {
          provide: VANTA_EFFECT_LOADER,
          useValue: (...args: unknown[]) => {
            loaderCalls += 1;
            return (loader as (...a: unknown[]) => Promise<LoadedVantaEffect>)(...args);
          },
        },
      ],
    });
    fixture = TestBed.createComponent(BackgroundComponent);
  }

  beforeEach(() => {
    destroyed = 0;
    created = 0;
    loaderCalls = 0;
    localStorage.removeItem('hug-docs-bg-paused');
  });

  afterEach(() => {
    localStorage.removeItem('hug-docs-bg-paused');
    TestBed.resetTestingModule();
  });

  it('always paints the CSS wash, before any effect is considered', () => {
    configure({ webgl: false });
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.wash')).toBeTruthy();
  });

  it('marks its layers decorative so assistive tech skips them', () => {
    configure({});
    fixture.detectChanges();
    for (const el of fixture.nativeElement.querySelectorAll('.wash, .effect')) {
      expect(el.getAttribute('aria-hidden')).toBe('true');
    }
  });

  it('does not download anything when the machine has no WebGL', async () => {
    configure({ webgl: false });
    fixture.detectChanges();
    await fixture.whenStable();
    expect(loaderCalls).toBe(0);
  });

  it('survives a loader that rejects', async () => {
    configure({ loader: () => Promise.reject(new Error('chunk failed')) });
    fixture.detectChanges();
    await fixture.whenStable();
    expect(fixture.nativeElement.querySelector('.wash')).toBeTruthy();
  });

  it('survives a factory that throws during init', async () => {
    configure({
      loader: async () => ({
        three: {},
        factory: () => {
          throw new Error('gl context lost');
        },
      }),
    });
    fixture.detectChanges();
    await fixture.whenStable();
    expect(fixture.nativeElement.querySelector('.wash')).toBeTruthy();
  });

  it('starts paused when the reader paused it on a previous page', async () => {
    localStorage.setItem('hug-docs-bg-paused', '1');
    configure({});
    fixture.detectChanges();
    await fixture.whenStable();
    expect(fixture.componentInstance.paused()).toBeTrue();
    expect(loaderCalls).toBe(0);
  });

  it('remembers a pause so it survives navigation', async () => {
    configure({});
    fixture.detectChanges();
    await fixture.whenStable();

    fixture.componentInstance.toggle();
    expect(fixture.componentInstance.paused()).toBeTrue();
    expect(localStorage.getItem('hug-docs-bg-paused')).toBe('1');
  });

  it('tears the effect down when paused, and does not leak it on destroy', async () => {
    configure({});
    fixture.detectChanges();
    await fixture.whenStable();
    expect(created).toBe(1);

    fixture.componentInstance.toggle();
    expect(destroyed).toBe(1);

    fixture.destroy();
    // Already torn down — destroy must not be called a second time on a dead
    // instance, which is what the generation counter is for.
    expect(destroyed).toBe(1);
  });

  it('destroys the effect on component teardown', async () => {
    configure({});
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.destroy();
    expect(destroyed).toBe(1);
  });
});
