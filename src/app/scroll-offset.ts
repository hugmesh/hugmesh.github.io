import { type EnvironmentProviders, inject, provideEnvironmentInitializer } from '@angular/core';
import { DOCUMENT, ViewportScroller } from '@angular/common';

/** Space between the sticky header's bottom edge and a heading scrolled to. */
export const ANCHOR_GAP_PX = 16;

/**
 * How far below the top of the window an anchor should land: the sticky
 * header's LIVE height plus a gap. Measured on every jump rather than read from
 * a constant, because the header is one row on a phone, two on a desktop, and
 * taller still when the phone menu is open.
 */
export function headerOffset(doc: Document): [number, number] {
  const header = doc.querySelector('hug-header');
  const height = header ? header.getBoundingClientRect().height : 0;
  return [0, Math.ceil(height) + ANCHOR_GAP_PX];
}

/**
 * The router's anchorScrolling (and every ViewportScroller.scrollToAnchor call)
 * scrolls with window.scrollTo and an offset that defaults to zero; CSS
 * scroll-margin-top does not apply to that. Without this, every table-of-contents
 * link and heading permalink parked its heading UNDER the sticky header.
 */
export function provideAnchorOffset(): EnvironmentProviders {
  return provideEnvironmentInitializer(() => {
    const doc = inject(DOCUMENT);
    inject(ViewportScroller).setOffset(() => headerOffset(doc));
  });
}
