import type { Installer } from './release-data';
import type { PlatformId } from '../shared/platform';

/**
 * Which Studio file a visitor should be handed first.
 *
 * Studio ships for 64-bit Windows (an MSI) and x86_64 Linux (a portable tar.gz
 * and a Flatpak bundle). Everything else (macOS, phones, tablets, BSD) gets no
 * installer: those visitors are shown every file plus the run-from-source path,
 * never a wrong installer presented as theirs.
 */
export type DownloadOs = 'windows' | 'linux' | 'other';

export const DOWNLOAD_OS_LABEL: Readonly<Record<DownloadOs, string>> = {
  windows: 'Windows',
  linux: 'Linux',
  other: 'macOS / other',
};

export function downloadOsFor(platform: PlatformId): DownloadOs {
  return platform === 'windows' || platform === 'linux' ? platform : 'other';
}

export interface DownloadChoice {
  /** The one big button, or null when there is no build for this system. */
  readonly primary: Installer | null;
  /** A second offer for the same system (the Flatpak on Linux). */
  readonly secondary: Installer | null;
  /** Every other file in the release, for the "other platforms" line. */
  readonly others: readonly Installer[];
}

/**
 * Windows: the MSI. Linux: the tar.gz first (it runs on any glibc 2.39+
 * distribution with nothing else installed), the Flatpak second (it needs Flatpak
 * and the KDE runtime). Anything else: no primary at all.
 */
export function chooseDownload(os: DownloadOs, installers: readonly Installer[]): DownloadChoice {
  const pick = (kind: Installer['kind']) => installers.find((i) => i.kind === kind) ?? null;
  let primary: Installer | null = null;
  let secondary: Installer | null = null;
  if (os === 'windows') {
    primary = pick('msi');
  } else if (os === 'linux') {
    primary = pick('tarball') ?? pick('flatpak');
    secondary = primary?.kind === 'tarball' ? pick('flatpak') : null;
  }
  const shown = new Set([primary, secondary].filter((i): i is Installer => i !== null));
  return { primary, secondary, others: installers.filter((i) => !shown.has(i)) };
}

/** Short platform name for a button, e.g. "Windows · .msi". */
export function shortLabel(i: Installer): string {
  switch (i.kind) {
    case 'msi':
      return 'Windows · .msi';
    case 'tarball':
      return 'Linux · .tar.gz';
    case 'flatpak':
      return 'Linux · Flatpak';
  }
}
