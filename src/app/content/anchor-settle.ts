import { headerOffset } from '../scroll-offset';

/** Real reader input. Anything else that moves the page is layout, not the reader. */
const READER_INPUT = ['wheel', 'touchstart', 'keydown', 'pointerdown', 'mousedown'] as const;

export interface AnchorSettle {
  /** Jump again now (used after something known to move the page, such as diagrams). */
  readonly rejump: () => void;
  /** Stop following the heading. */
  readonly stop: () => void;
}

export interface SettleOptions {
  /** Stop once the page has not changed size for this long. */
  readonly quietMs?: number;
  /** Stop after this long whatever happens. */
  readonly maxMs?: number;
}

/**
 * Bring the element with `id` to just below the sticky header, and KEEP it there
 * while the page is still settling.
 *
 * WHY A SETTLE WINDOW. A cold-loaded /page#heading jumps the moment the body is
 * rendered, which is before the web fonts have swapped in and before any
 * Mermaid diagram has been drawn. Both change the height of everything above the
 * heading (measured: a font swap shrank one page by 2,556px), and the browser
 * then moves the scroll position itself, so a single jump ended anywhere from
 * 230px under the header to 2,000px below it. So: jump, then jump again whenever
 * `container` changes size, until it has been quiet for `quietMs`, `maxMs` has
 * passed, or the reader does anything.
 *
 * "The reader did something" is decided from INPUT EVENTS (wheel, touch, key,
 * pointer), never from scrollY: the layout shift itself moves scrollY, and
 * mistaking that for the reader is exactly the bug this replaces.
 *
 * Vertical only: the jump never changes scrollX (Angular's scrollToElement also
 * scrolled sideways by the heading's left offset).
 */
export function settleOnAnchor(
  doc: Document,
  id: string,
  container: Element | null,
  { quietMs = 2500, maxMs = 15000 }: SettleOptions = {},
): AnchorSettle {
  const win = doc.defaultView;
  let done = false;
  let quiet: ReturnType<typeof setTimeout> | undefined;
  let cap: ReturnType<typeof setTimeout> | undefined;
  let ro: ResizeObserver | null = null;

  const jump = () => {
    if (done || !win) return;
    const el = doc.getElementById(id);
    if (!el) return;
    const top = el.getBoundingClientRect().top + win.scrollY - headerOffset(doc)[1];
    win.scrollTo({ top, behavior: 'instant' });
  };

  const stop = () => {
    if (done) return;
    done = true;
    ro?.disconnect();
    clearTimeout(quiet);
    clearTimeout(cap);
    for (const type of READER_INPUT) win?.removeEventListener(type, stop, true);
  };

  if (!win) return { rejump: () => undefined, stop: () => undefined };

  for (const type of READER_INPUT) win.addEventListener(type, stop, { capture: true, passive: true });
  quiet = setTimeout(stop, quietMs);
  cap = setTimeout(stop, maxMs);

  if (container && typeof ResizeObserver !== 'undefined') {
    ro = new ResizeObserver(() => {
      jump();
      clearTimeout(quiet);
      quiet = setTimeout(stop, quietMs);
    });
    ro.observe(container);
  }

  jump();
  const fonts = (doc as Document & { fonts?: FontFaceSet }).fonts;
  void fonts?.ready.then(jump);
  return { rejump: jump, stop };
}
