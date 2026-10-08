/**
 * Which platform is the visitor on, and what do we hand them?
 *
 * WHY DETECTION AT ALL. The front door's job is to get someone to a working
 * Studio in one click. Making them read three install sections to find their own
 * is the failure this exists to prevent — so the detected platform LEADS and the
 * others stay one click away, never hidden.
 *
 * DETECTION IS A GUESS, AND IS TREATED AS ONE. Every surface that uses this also
 * renders the other platforms, so a wrong guess costs a click rather than
 * stranding someone. `userAgentData.platform` is the only non-deprecated source
 * and it is Chromium-only; `navigator.platform` is deprecated but still the most
 * reliable signal in Firefox and Safari; the user-agent string is the last
 * resort. We never fingerprint beyond this.
 */
export type PlatformId = 'linux' | 'windows' | 'macos' | 'source';

/** What we can actually offer for a platform today. */
export interface PlatformOffer {
  readonly id: PlatformId;
  /** Shown as the platform's name. */
  readonly name: string;
  /** The packaging, e.g. "Flatpak". */
  readonly badge: string;
  /** One-line description for the secondary cards. */
  readonly short: string;
  /** The pastel this platform is keyed to — a token value, all AAA on --hug-bg-0. */
  readonly accent: string;
  /**
   * True when this platform has a downloadable installer *in principle*.
   * Whether one is actually published is a separate question answered by
   * assets/releases.json at runtime — see `DownloadsComponent`.
   */
  readonly packaged: boolean;
  /** Commands that work today, with no release published. */
  readonly install: readonly string[];
  /** How to check what you downloaded, once there is something to check. */
  readonly verify: string;
  readonly note: string;
}

/**
 * The offers, keyed by platform.
 *
 * `packaged: false` on macOS is not an oversight — the generator publishes a
 * Flatpak and an MSI, and everything else runs the same Python from source.
 * Saying so is kinder than implying a .dmg is coming.
 */
export const PLATFORM_OFFERS: Readonly<Record<PlatformId, PlatformOffer>> = {
  linux: {
    id: 'linux',
    name: 'Linux',
    badge: 'Flatpak',
    short: 'Flatpak · any distribution',
    accent: '#caffbf',
    packaged: true,
    install: [
      'flatpak install --user hugmesh-studio-<version>-x86_64.flatpak',
      'flatpak run org.hugmesh.ImageStudio',
    ],
    verify: 'sha256sum hugmesh-studio-<version>-x86_64.flatpak',
    note:
      'Any distribution with Flatpak and the KDE 6.8 runtime. Wayland and X11 both ' +
      'work. It installs for your user, so it needs no root. It still needs a ' +
      'hugmesh-generator checkout: start it with --generator-dir <path>.',
  },
  windows: {
    id: 'windows',
    name: 'Windows',
    badge: 'MSI',
    short: 'MSI · Windows 10 or later',
    accent: '#bde0fe',
    packaged: true,
    install: ['msiexec /i hugmesh-studio-<version>-x64.msi'],
    verify: 'Get-FileHash .\\hugmesh-studio-<version>-x64.msi -Algorithm SHA256',
    note:
      'A per-user install on 64-bit Windows 10 or later, with no administrator ' +
      'rights. The MSI is not code-signed, so SmartScreen warns the first time you ' +
      'run it. It still needs a hugmesh-generator checkout.',
  },
  macos: {
    id: 'macos',
    name: 'macOS',
    badge: 'From source',
    short: 'Python · no packaged build',
    accent: '#ffd6a5',
    packaged: false,
    install: [
      'git clone https://github.com/hugmesh/hugmesh-generator',
      'cd hugmesh-generator/studio',
      'python3 -m venv .venv && . .venv/bin/activate',
      'pip install -r requirements.txt',
      './hugmesh-studio',
    ],
    verify: 'git log -1 --show-signature',
    note:
      'There is no packaged macOS build. Studio is Python and Qt, so it runs from ' +
      'a checkout the same way the packaged builds do — they wrap this same code.',
  },
  source: {
    id: 'source',
    name: 'From source',
    badge: 'Python',
    short: 'Python · anywhere Qt runs',
    accent: '#d0b4f5',
    packaged: false,
    install: [
      'git clone https://github.com/hugmesh/hugmesh-generator',
      'cd hugmesh-generator/studio',
      'python3 -m venv .venv && . .venv/bin/activate',
      'pip install -r requirements.txt',
      './hugmesh-studio            # Windows: hugmesh-studio.bat',
    ],
    verify: 'git log -1 --show-signature',
    note:
      'BSD, macOS, and anywhere else Python and Qt run. The installers package ' +
      'this same code — they exist for people who would rather not manage a ' +
      'Python environment.',
  },
};

/** Every platform, in the order the secondary list shows them. */
export const PLATFORM_ORDER: readonly PlatformId[] = ['linux', 'windows', 'macos', 'source'];

/**
 * Best guess at the visitor's platform.
 *
 * Returns `source` when nothing matches, and when there is no `navigator` at
 * all — a prerender or a unit test. That default is deliberate: the from-source
 * path is the one that works on every platform, so an unknown visitor is shown
 * something that will actually run rather than an installer that may not be for
 * them.
 */
export function detectPlatform(
  // `null` is accepted, and is the ONLY way to say "pretend there is no
  // navigator". A default parameter fires on explicit `undefined` too, so
  // detectPlatform(undefined) would substitute the real one and the guard below
  // would be untestable — which is exactly how it shipped until a test caught it.
  nav: Navigator | null | undefined = globalThis.navigator,
): PlatformId {
  if (!nav) return 'source';

  // userAgentData.platform is the only non-deprecated source, but it is
  // Chromium-only, so it is a first choice rather than the only one.
  const hinted = (nav as Navigator & { userAgentData?: { platform?: string } })
    .userAgentData?.platform;
  const haystack = `${hinted ?? ''} ${nav.platform ?? ''} ${nav.userAgent ?? ''}`.toLowerCase();

  // Order matters. "android" contains "linux" in the UA string, and iPadOS
  // reports a Macintosh UA — neither should be handed a desktop installer, so
  // both fall through to the source path below.
  if (/android|iphone|ipad|ipod/.test(haystack)) return 'source';
  if (/win/.test(haystack)) return 'windows';
  if (/mac/.test(haystack)) return 'macos';
  if (/linux|x11|cros|bsd/.test(haystack)) return 'linux';
  return 'source';
}
