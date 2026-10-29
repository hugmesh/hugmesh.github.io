import { TestBed } from '@angular/core/testing';
import { ViewportScroller } from '@angular/common';
import { appConfig } from './app.config';
import { ANCHOR_GAP_PX } from './scroll-offset';

/**
 * Where an in-page jump lands, with the app's REAL providers (app.config.ts).
 * The router's anchorScrolling and the doc page both go through
 * ViewportScroller.scrollToAnchor, which calls window.scrollTo; a heading must
 * end up below the sticky header, not under it at y = 0.
 */
describe('anchor scrolling offset', () => {
  let header: HTMLElement;
  let target: HTMLElement;

  beforeEach(() => {
    header = document.createElement('hug-header');
    header.style.cssText = 'display:block;position:sticky;top:0;height:81px';
    target = document.createElement('h2');
    target.id = 'offset-target';
    target.style.marginTop = '2400px';
    document.body.append(header, target);
    TestBed.configureTestingModule({ providers: [...appConfig.providers] });
  });

  afterEach(() => {
    header.remove();
    target.remove();
  });

  it('stops the heading the header height plus a gap below the top of the window', () => {
    const scrollTo = spyOn(window, 'scrollTo');
    TestBed.inject(ViewportScroller).scrollToAnchor('offset-target');
    expect(scrollTo).toHaveBeenCalledTimes(1);
    const top = (scrollTo.calls.mostRecent().args[0] as ScrollToOptions).top!;
    const absolute = target.getBoundingClientRect().top + window.scrollY;
    expect(absolute - top).toBe(81 + ANCHOR_GAP_PX);
    // Vertical only: never scroll sideways by the heading's left edge.
    expect((scrollTo.calls.mostRecent().args[0] as ScrollToOptions).left!).toBeLessThanOrEqual(0);
  });

  it('follows the header when it changes height (one row on a phone, two on a desktop)', () => {
    header.style.height = '134px';
    const scrollTo = spyOn(window, 'scrollTo');
    TestBed.inject(ViewportScroller).scrollToAnchor('offset-target');
    const top = (scrollTo.calls.mostRecent().args[0] as ScrollToOptions).top!;
    expect(target.getBoundingClientRect().top + window.scrollY - top).toBe(134 + ANCHOR_GAP_PX);
  });
});
