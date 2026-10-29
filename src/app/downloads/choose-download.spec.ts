import { DOWNLOAD_ARCH_ORDER, chooseDownload, detectArch, shortLabel } from './choose-download';
import type { Installer } from './release-data';
import published from './testing/releases.published.fixture.json';

const installers = published.studio!.installers as readonly Installer[];
const find = (kind: Installer['kind'], arch: Installer['arch'] = 'x86_64') =>
  installers.find((i) => i.kind === kind && i.arch === arch)!;

/** A stand-in Navigator carrying only what detectArch reads. */
function nav(ua: string, hints?: { architecture?: string; bitness?: string } | 'refused'): Navigator {
  const userAgentData =
    hints === undefined
      ? undefined
      : {
          getHighEntropyValues: () =>
            hints === 'refused' ? Promise.reject(new Error('NotAllowedError')) : Promise.resolve(hints),
        };
  return { userAgent: ua, ...(userAgentData ? { userAgentData } : {}) } as unknown as Navigator;
}

const CHROMIUM_LINUX = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const FIREFOX_X86 = 'Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:133.0) Gecko/20100101 Firefox/133.0';
const FIREFOX_ARM = 'Mozilla/5.0 (X11; Linux aarch64; rv:133.0) Gecko/20100101 Firefox/133.0';

describe('detectArch', () => {
  it('believes the high-entropy client hint, which is the only honest signal', async () => {
    expect(await detectArch(nav(CHROMIUM_LINUX, { architecture: 'arm', bitness: '64' }))).toBe('aarch64');
    expect(await detectArch(nav(CHROMIUM_LINUX, { architecture: 'x86', bitness: '64' }))).toBe('x86_64');
  });

  it('answers null for a 32-bit or unknown hint rather than guessing', async () => {
    expect(await detectArch(nav(CHROMIUM_LINUX, { architecture: 'arm', bitness: '32' }))).toBeNull();
    expect(await detectArch(nav(CHROMIUM_LINUX, { architecture: 'x86', bitness: '32' }))).toBeNull();
    expect(await detectArch(nav(CHROMIUM_LINUX, {}))).toBeNull();
  });

  // Chromium's reduced UA says "Linux x86_64" on every Linux machine, ARM included.
  it('never infers x86_64 from a Chromium user-agent string', async () => {
    expect(await detectArch(nav(CHROMIUM_LINUX))).toBeNull();
    expect(await detectArch(nav(CHROMIUM_LINUX, 'refused'))).toBeNull();
  });

  it('reads the real machine out of a Firefox user-agent string', async () => {
    expect(await detectArch(nav(FIREFOX_ARM))).toBe('aarch64');
    expect(await detectArch(nav(FIREFOX_X86))).toBe('x86_64');
    expect(await detectArch(nav('Mozilla/5.0 (X11; Linux arm64) AppleWebKit/537.36 Safari/537.36'))).toBe('aarch64');
  });

  it('answers null with no navigator at all (a prerender, a unit test)', async () => {
    expect(await detectArch(null)).toBeNull();
  });
});

describe('chooseDownload', () => {
  it('hands Windows the MSI and lists the rest, whatever the architecture says', () => {
    for (const arch of [...DOWNLOAD_ARCH_ORDER, null]) {
      const c = chooseDownload('windows', installers, arch);
      expect(c.primary).toBe(find('msi'));
      expect(c.secondary).toBeNull();
      expect(c.alternate).toBeNull();
      expect(c.others.map((i) => i.file)).toEqual([find('flatpak').file, find('flatpak', 'aarch64').file, find('tarball').file]);
    }
  });

  it('hands x86_64 Linux the tar.gz, then its Flatpak; the aarch64 Flatpak is an "other"', () => {
    const c = chooseDownload('linux', installers, 'x86_64');
    expect(c.primary).toBe(find('tarball'));
    expect(c.secondary).toBe(find('flatpak'));
    expect(c.alternate).toBeNull();
    expect(c.others).toEqual([find('msi'), find('flatpak', 'aarch64')]);
  });

  it('hands aarch64 Linux its Flatpak as the one download: there is no aarch64 tarball', () => {
    const c = chooseDownload('linux', installers, 'aarch64');
    expect(c.primary).toBe(find('flatpak', 'aarch64'));
    expect(c.secondary).toBeNull();
    expect(c.alternate).toBeNull();
    expect(c.others).toEqual([find('msi'), find('flatpak'), find('tarball')]);
  });

  it('offers both architectures when the browser says nothing, with the x86_64 pair plus the aarch64 bundle', () => {
    const c = chooseDownload('linux', installers, null);
    expect(c.primary).toBe(find('tarball'));
    expect(c.secondary).toBe(find('flatpak'));
    expect(c.alternate).toBe(find('flatpak', 'aarch64'));
    expect(c.others).toEqual([find('msi')]);
  });

  it('would hand an aarch64 tarball first if one were ever published', () => {
    const armTarball: Installer = { ...find('tarball'), arch: 'aarch64', file: 'hugmesh-studio-0.3.0-beta.2-linux-aarch64.tar.gz' };
    const c = chooseDownload('linux', [...installers, armTarball], 'aarch64');
    expect(c.primary).toBe(armTarball);
    expect(c.secondary).toBe(find('flatpak', 'aarch64'));
  });

  it('gives nothing primary to macOS and other systems, and lists every file', () => {
    const c = chooseDownload('other', installers, null);
    expect(c.primary).toBeNull();
    expect(c.alternate).toBeNull();
    expect(c.others.length).toBe(4);
  });

  it('names the architecture in every Linux short label', () => {
    expect(shortLabel(find('flatpak', 'aarch64'))).toBe('Linux · Flatpak (aarch64)');
    expect(shortLabel(find('flatpak'))).toBe('Linux · Flatpak (x86_64)');
    expect(shortLabel(find('tarball'))).toBe('Linux · .tar.gz (x86_64)');
    expect(shortLabel(find('msi'))).toBe('Windows · .msi');
  });
});
