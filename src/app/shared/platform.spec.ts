import { PLATFORM_OFFERS, PLATFORM_ORDER, detectPlatform, type PlatformId } from './platform';

/** A stand-in Navigator carrying only the fields detectPlatform reads. */
function nav(ua: string, platform = '', hinted?: string): Navigator {
  return {
    userAgent: ua,
    platform,
    ...(hinted ? { userAgentData: { platform: hinted } } : {}),
  } as unknown as Navigator;
}

describe('detectPlatform', () => {
  it('reads the Chromium platform hint when there is one', () => {
    expect(detectPlatform(nav('', '', 'Windows'))).toBe('windows');
    expect(detectPlatform(nav('', '', 'macOS'))).toBe('macos');
    expect(detectPlatform(nav('', '', 'Linux'))).toBe('linux');
  });

  it('falls back to navigator.platform, then to the user-agent string', () => {
    expect(detectPlatform(nav('', 'Win32'))).toBe('windows');
    expect(detectPlatform(nav('', 'MacIntel'))).toBe('macos');
    expect(detectPlatform(nav('Mozilla/5.0 (X11; Linux x86_64)'))).toBe('linux');
  });

  it('recognises the real desktop user-agent strings', () => {
    expect(
      detectPlatform(nav('Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/131.0.0.0')),
    ).toBe('windows');
    expect(
      detectPlatform(nav('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari/605.1.15')),
    ).toBe('macos');
    expect(
      detectPlatform(nav('Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:133.0) Gecko/20100101')),
    ).toBe('linux');
  });

  // The two orderings that make this function non-trivial. Android's UA CONTAINS
  // "linux", and iPadOS reports a Macintosh UA — matching either naively hands a
  // phone or tablet a desktop installer it cannot run.
  it('does not hand Android a Linux desktop build', () => {
    expect(
      detectPlatform(nav('Mozilla/5.0 (Linux; Android 14; Pixel 8) Chrome/131.0.0.0 Mobile')),
    ).toBe('source');
  });

  it('does not hand iPadOS a macOS build, despite its Macintosh user-agent', () => {
    expect(
      detectPlatform(nav('Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) Version/17.0 Safari')),
    ).toBe('source');
    expect(
      detectPlatform(nav('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Safari')),
    ).toBe('source');
  });

  it('defaults to the from-source path when nothing matches', () => {
    expect(detectPlatform(nav('Some unknown agent', 'Weird'))).toBe('source');
  });

  // A prerender or a unit environment has no navigator at all. Returning the
  // path that works everywhere beats guessing at an installer.
  it('survives having no navigator', () => {
    expect(detectPlatform(null)).toBe('source');
  });

  // Guards the signature itself: a default parameter fires on explicit
  // `undefined`, so before `null` was accepted there was NO way to exercise the
  // absent-navigator branch, and the test that thought it did was passing the
  // real one instead.
  it('substitutes the live navigator when the argument is omitted', () => {
    expect(detectPlatform()).toBe(detectPlatform(globalThis.navigator));
  });
});

describe('PLATFORM_OFFERS', () => {
  it('has an offer for every id in PLATFORM_ORDER, and nothing orphaned', () => {
    const keys = Object.keys(PLATFORM_OFFERS).sort();
    expect([...PLATFORM_ORDER].sort()).toEqual(keys as PlatformId[]);
  });

  it('gives every offer a runnable first command and a way to verify it', () => {
    for (const id of PLATFORM_ORDER) {
      const o = PLATFORM_OFFERS[id];
      expect(o.install.length).withContext(`${id} install`).toBeGreaterThan(0);
      expect(o.install[0].trim()).withContext(`${id} first command`).not.toBe('');
      expect(o.verify.trim()).withContext(`${id} verify`).not.toBe('');
      expect(o.note.trim()).withContext(`${id} note`).not.toBe('');
    }
  });

  // The front door must not imply a packaged build exists where one does not.
  // Only the two the generator actually publishes may claim to be packaged.
  it('claims a packaged build only for Linux and Windows', () => {
    const packaged = PLATFORM_ORDER.filter((id) => PLATFORM_OFFERS[id].packaged);
    expect(packaged.sort()).toEqual(['linux', 'windows']);
  });

  it('routes every unpackaged platform through a source checkout', () => {
    for (const id of PLATFORM_ORDER) {
      const o = PLATFORM_OFFERS[id];
      if (o.packaged) continue;
      expect(o.install.join('\n'))
        .withContext(`${id} should install from source`)
        .toContain('hugmesh-generator');
    }
  });
});
