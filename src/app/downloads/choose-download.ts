import type { Installer, InstallerArch } from './release-data';
import type { PlatformId } from '../shared/platform';

/**
 * Which Studio file a visitor should be handed first.
 *
 * Studio ships for 64-bit Windows (an MSI), x86_64 Linux (a portable tar.gz and a
 * Flatpak bundle) and aarch64 Linux (a Flatpak bundle, since 2026-10-29).
 * Everything else (macOS, phones, tablets, BSD) gets no installer: those visitors
 * are shown every file plus the run-from-source path, never a wrong installer
 * presented as theirs.
 */
export type DownloadOs = 'windows' | 'linux' | 'other';

export const DOWNLOAD_OS_LABEL: Readonly<Record<DownloadOs, string>> = {
  windows: 'Windows',
  linux: 'Linux',
  other: 'macOS / other',
};

/**
 * The Linux architectures a visitor can choose between. The names are the ones
 * `uname -m` and `flatpak --default-arch` print, so a visitor can check.
 */
export type DownloadArch = InstallerArch;
export const DOWNLOAD_ARCH_ORDER: readonly DownloadArch[] = ['x86_64', 'aarch64'];
export const DOWNLOAD_ARCH_LABEL: Readonly<Record<DownloadArch, string>> = {
  x86_64: 'x86_64 (Intel / AMD)',
  aarch64: 'ARM64 (aarch64)',
};

export function downloadOsFor(platform: PlatformId): DownloadOs {
  return platform === 'windows' || platform === 'linux' ? platform : 'other';
}

/** The slice of the UA Client Hints API that `detectArch` reads; Chromium only. */
interface UserAgentDataLike {
  getHighEntropyValues?: (hints: string[]) => Promise<{ architecture?: string; bitness?: string }>;
}

/**
 * Best guess at the visitor's CPU architecture, or null when the browser does not say.
 *
 * WHY THIS IS ASYNC AND USUALLY NULL. The only honest signal is the UA Client Hints
 * `architecture` + `bitness` pair, which is a HIGH-entropy hint: Chromium hands it
 * out only through the asynchronous `getHighEntropyValues`, and nothing else
 * implements it. The user-agent string is no substitute: Chromium's reduced UA
 * reports `Linux x86_64` on every Linux machine, ARM included, so `x86_64` in a UA
 * string proves nothing. Firefox still reports the real machine (`Linux aarch64`),
 * so an `aarch64`/`arm64` token is believed from any browser, and `x86_64` only from
 * Firefox. Everything else is null, and a null means the page OFFERS BOTH rather
 * than guessing: a wrong Flatpak costs a download and an "unsupported
 * architecture" refusal from `flatpak install`.
 */
export async function detectArch(
  nav: Navigator | null | undefined = globalThis.navigator,
): Promise<DownloadArch | null> {
  if (!nav) return null;
  const uaData = (nav as Navigator & { userAgentData?: UserAgentDataLike }).userAgentData;
  if (uaData && typeof uaData.getHighEntropyValues === 'function') {
    try {
      const { architecture, bitness } = await uaData.getHighEntropyValues(['architecture', 'bitness']);
      if (bitness === '64') {
        if (architecture === 'arm') return 'aarch64';
        if (architecture === 'x86') return 'x86_64';
      }
      return null;
    } catch {
      // The browser refused the hint (a permissions policy, a privacy setting): fall through.
    }
  }
  const ua = (nav.userAgent ?? '').toLowerCase();
  if (/aarch64|arm64/.test(ua)) return 'aarch64';
  if (/firefox\//.test(ua) && /x86_64|x64/.test(ua)) return 'x86_64';
  return null;
}

export interface DownloadChoice {
  /** The one big button, or null when there is no build for this system. */
  readonly primary: Installer | null;
  /** A second offer for the same system and architecture (the Flatpak on Linux). */
  readonly secondary: Installer | null;
  /**
   * On Linux, when the architecture is not known: the other architecture's first
   * choice, offered beside `primary` with equal weight, so a visitor whose browser
   * says nothing about the machine is handed both and told why. Null otherwise.
   */
  readonly alternate: Installer | null;
  /** Every other file in the release, for the "other platforms" line. */
  readonly others: readonly Installer[];
}

/** For one Linux architecture: the tar.gz first, the Flatpak second. */
function linuxPair(arch: DownloadArch, installers: readonly Installer[]): [Installer | null, Installer | null] {
  const pick = (kind: Installer['kind']) => installers.find((i) => i.kind === kind && i.arch === arch) ?? null;
  const primary = pick('tarball') ?? pick('flatpak');
  const secondary = primary?.kind === 'tarball' ? pick('flatpak') : null;
  return [primary, secondary];
}

/**
 * Windows: the MSI. Linux: the tar.gz first for the visitor's architecture (it runs on
 * any glibc 2.39+ distribution with nothing else installed), the Flatpak second (it
 * needs Flatpak and the KDE runtime); on aarch64 only the Flatpak exists, so it is the
 * primary. Linux with the architecture unknown: x86_64's pair plus aarch64's first
 * choice as `alternate`. Anything else: no primary at all.
 */
export function chooseDownload(
  os: DownloadOs,
  installers: readonly Installer[],
  arch: DownloadArch | null = 'x86_64',
): DownloadChoice {
  let primary: Installer | null = null;
  let secondary: Installer | null = null;
  let alternate: Installer | null = null;
  if (os === 'windows') {
    primary = installers.find((i) => i.kind === 'msi') ?? null;
  } else if (os === 'linux') {
    [primary, secondary] = linuxPair(arch ?? 'x86_64', installers);
    if (arch === null) {
      const other = DOWNLOAD_ARCH_ORDER.find((a) => a !== 'x86_64') ?? 'aarch64';
      [alternate] = linuxPair(other, installers);
    }
  }
  const shown = new Set([primary, secondary, alternate].filter((i): i is Installer => i !== null));
  return { primary, secondary, alternate, others: installers.filter((i) => !shown.has(i)) };
}

/** Short platform name for a button, e.g. "Windows · .msi" or "Linux · Flatpak (aarch64)". */
export function shortLabel(i: Installer): string {
  switch (i.kind) {
    case 'msi':
      return 'Windows · .msi';
    case 'tarball':
      return `Linux · .tar.gz (${i.arch})`;
    case 'flatpak':
      return `Linux · Flatpak (${i.arch})`;
  }
}
