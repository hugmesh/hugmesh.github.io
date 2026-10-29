import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { DownloadsComponent } from './downloads.component';
import { validateReleaseData } from './release-data';
// Written by scripts/fetch-releases.mjs from recorded API answers, and checked
// against its live output by scripts/fetch-releases.test.mjs. Rendering them
// here is what ties "what the build writes" to "what the page can show".
import published from './testing/releases.published.fixture.json';
import empty from './testing/releases.empty.fixture.json';
// The hand-written list the page is generated from. Every repository in it must
// reach the page; scripts/check-release-sources.mjs checks the list against the org.
import sources from '../../../release-sources.json';

describe('release data fixtures', () => {
  it('are valid release data, by the validator the page runs', () => {
    expect(validateReleaseData(published)).toEqual([]);
    expect(validateReleaseData(empty)).toEqual([]);
  });
});

describe('DownloadsComponent', () => {
  let fixture: ComponentFixture<DownloadsComponent>;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [DownloadsComponent],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(DownloadsComponent);
    // A fixed system, so the test does not depend on the browser running it.
    fixture.componentRef.setInput('initialOs', 'windows');
    fixture.detectChanges();
  });

  afterEach(() => http.verify());

  function serve(body: object): HTMLElement {
    http.expectOne('assets/releases.json').flush(body);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  const text = (el: Element | null) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
  const pick = (el: HTMLElement, os: string) => {
    (el.querySelector(`[data-testid="os-${os}"]`) as HTMLButtonElement).click();
    fixture.detectChanges();
  };
  const installer = (kind: string) => published.studio!.installers.find((i) => i.kind === kind)!;

  describe('with a published Studio beta and two published images', () => {
    let el: HTMLElement;
    beforeEach(() => (el = serve(published)));

    it('hands a Windows visitor ONE big button for the MSI, with version, beta label, size and SHA-256', () => {
      const msi = installer('msi');
      const btn = el.querySelector<HTMLAnchorElement>('[data-testid="primary-download"]')!;
      expect(btn.getAttribute('href')).toBe(msi.url);
      expect(text(btn)).toContain('Download for Windows');
      expect(text(btn)).toContain(msi.file);
      expect(el.querySelector('[data-testid="secondary-download"]')).toBeNull();
      expect(text(el.querySelector('#get h2'))).toContain('Studio 0.3.0-beta.2');
      expect(text(el.querySelector('[data-testid="get-beta"]'))).toBe('Beta');
      expect(text(el.querySelector('[data-testid="primary-size"]'))).toBe(msi.size);
      expect(text(el.querySelector('[data-testid="primary-sha"]'))).toBe(msi.sha256!);
      expect(text(el.querySelector('#get'))).toContain(`(Get-FileHash .\\${msi.file} -Algorithm SHA256).Hash`);
    });

    it('says the MSI is unsigned and how to get past SmartScreen, because the data says so', () => {
      const t = text(el.querySelector('[data-testid="smartscreen"]'));
      expect(t).toContain('not Authenticode-signed yet');
      expect(t).toContain('More info');
      expect(t).toContain('Run anyway');
    });

    it('lists the other platforms under the button', () => {
      const others = el.querySelector('[data-testid="other-platforms"]')!;
      const hrefs = Array.from(others.querySelectorAll('a[href^="https"]')).map((a) => a.getAttribute('href'));
      expect(hrefs).toEqual([installer('flatpak').url, installer('tarball').url]);
    });

    it('hands a Linux visitor the tar.gz first and the Flatpak second', () => {
      pick(el, 'linux');
      expect(el.querySelector('[data-testid="primary-download"]')!.getAttribute('href')).toBe(installer('tarball').url);
      expect(el.querySelector('[data-testid="secondary-download"]')!.getAttribute('href')).toBe(installer('flatpak').url);
      expect(text(el.querySelector('#get'))).toContain(`sha256sum ${installer('tarball').file}`);
      expect(el.querySelector('[data-testid="smartscreen"]')).toBeNull();
      expect(text(el.querySelector('[data-testid="get-for"]'))).toContain('Showing Linux');
    });

    it('never hands a macOS or phone visitor a wrong installer as theirs', () => {
      pick(el, 'other');
      expect(el.querySelector('[data-testid="primary-download"]')).toBeNull();
      expect(text(el.querySelector('[data-testid="no-build"]'))).toContain('no packaged Studio for macOS');
      expect(el.querySelectorAll('[data-testid="other-platforms"] a[href^="https"]').length).toBe(3);
    });

    it('lists every installer with an absolute download link to the release', () => {
      const links = Array.from(el.querySelectorAll<HTMLAnchorElement>('#studio a.btn'));
      expect(links.map((a) => a.getAttribute('href'))).toEqual(published.studio!.installers.map((i) => i.url));
      expect(links.length).toBe(3);
      for (const a of links) {
        expect(a.getAttribute('href')).toMatch(
          /^https:\/\/github\.com\/hugmesh\/hugmesh-generator\/releases\/download\/studio-v0\.3\.0-beta\.2\//,
        );
      }
      expect(text(el.querySelector('#studio'))).toContain('Version 0.3.0-beta.2');
      expect(text(el.querySelector('#studio .product-head'))).toContain('Beta');
    });

    it('says plainly that the MSI is not Authenticode-signed, because the data says so', () => {
      const status = text(el.querySelector('[data-testid="studio-status"]'));
      expect(status).toContain('not Authenticode-signed yet');
      expect(status).toContain('SmartScreen will warn');
      expect(status).toContain('Build provenance is attested for 2 of 3 files');
      expect(status).toContain('SHA256SUMS is signed with Sigstore');
    });

    it('links SHA256SUMS and its signature bundle, and prints verify commands with the real identity', () => {
      const hrefs = Array.from(el.querySelectorAll<HTMLAnchorElement>('.verify a')).map((a) => a.getAttribute('href'));
      expect(hrefs).toContain(published.studio!.checksums!.url);
      expect(hrefs).toContain(published.studio!.checksumsSignature!.url);
      const sums = text(el.querySelector('[data-testid="verify-sums"]'));
      expect(sums).toContain('sha256sum --ignore-missing -c SHA256SUMS');
      expect(sums).toContain('cosign verify-blob SHA256SUMS');
      expect(sums).toContain('--bundle SHA256SUMS.sigstore.json');
      expect(sums).toContain(`'${published.studio!.identity.regexp}'`);
      expect(sums).toContain('--certificate-oidc-issuer https://token.actions.githubusercontent.com');
      const attest = text(el.querySelector('[data-testid="verify-attest"]'));
      for (const i of published.studio!.installers) {
        expect(attest).toContain(`gh attestation verify ${i.file} --repo hugmesh/hugmesh-generator`);
      }
    });

    it('keeps every older Studio release downloadable, in a collapsed list', () => {
      const archive = el.querySelector<HTMLDetailsElement>('[data-testid="archive"]')!;
      expect(archive.open).toBeFalse();
      expect(text(archive.querySelector('summary'))).toBe('Older Studio releases (1)');
      const hrefs = Array.from(archive.querySelectorAll('a')).map((a) => a.getAttribute('href'));
      for (const f of published.studioArchive[0].files) expect(hrefs).toContain(f.url);
      expect(hrefs).toContain(published.studioArchive[0].notesUrl);
    });

    it('shows a GHCR link, a pull line, the digest and a cosign verify line for a published image', () => {
      const card = el.querySelector('#images li[data-image="admin-ui"]')!;
      const t = text(card);
      expect(card.querySelector('.ref a')!.getAttribute('href')).toBe(
        'https://github.com/orgs/hugmesh/packages/container/package/hugmesh-admin-ui',
      );
      expect(t).toContain('docker pull ghcr.io/hugmesh/hugmesh-admin-ui:0.3.0-beta.10');
      expect(t).toContain('cosign verify ghcr.io/hugmesh/hugmesh-admin-ui@sha256:dddd');
      expect(t).toContain('--certificate-identity-regexp');
      expect(t).toContain('gh attestation verify oci://ghcr.io/hugmesh/hugmesh-admin-ui@sha256:');
      expect(t).toContain('Beta');
      expect(text(card.querySelector('[data-testid="image-version"]'))).toBe('0.3.0-beta.10');
      expect(getComputedStyle(card.querySelector('[data-testid="image-version"]')!).textTransform).toBe('none');
      expect(t).toContain('Signed with cosign; build provenance attested.');
    });

    it('lists the mesh-node image first, with its own signing identity', () => {
      const first = el.querySelector('#images .images li');
      expect(first?.getAttribute('data-image')).toBe('mesh-node');
      expect(text(first)).toContain('ghcr.io/hugmesh/hugmesh-mesh-node');
      expect(text(first)).toContain('mesh-node-release');
    });

    it('lists every unpublished image as not released yet, with its repository and no pull line', () => {
      const rows = Array.from(el.querySelectorAll('[data-testid="images-pending"] tr[data-image]'));
      expect(rows.length).toBe(published.images.length - 2);
      for (const r of rows) {
        expect(text(r)).toMatch(/not released yet|not public on GitHub Container Registry yet/);
        expect(text(r)).not.toContain('docker pull');
        expect(r.querySelector('td:last-child a')!.getAttribute('href')).toMatch(/^https:\/\/github\.com\/hugmesh\/[a-z0-9-]+$/);
      }
      expect(text(el.querySelector('[data-testid="images-status"]'))).toContain(
        `2 of ${published.images.length} images published`,
      );
    });

    it('says when an image was released on GitHub but is still private on the registry', () => {
      const row = el.querySelector('[data-testid="images-pending"] tr[data-image="user-ui"]')!;
      expect(text(row)).toContain('released as v0.3.0-beta.1, but the image is not public on GitHub Container Registry yet');
      expect(row.querySelector('[data-testid="image-private"] a')!.getAttribute('href')).toBe(
        'https://github.com/hugmesh/hugmesh-user-ui/releases/tag/v0.3.0-beta.1',
      );
      expect(text(row)).not.toContain('docker pull');
    });

    it('gives a released Maven library its coordinates, GitHub Packages link and a dependency snippet', () => {
      const li = el.querySelector('[data-package="commons"]')!;
      const t = text(li);
      expect(t).toContain('net.hugmesh:hugmesh-commons');
      expect(t).toContain('<artifactId>hugmesh-commons</artifactId>');
      expect(t).toContain('<version>2.2.0-beta.1</version>');
      expect(t).toContain('https://maven.pkg.github.com/hugmesh/hugmesh-commons');
      const hrefs = Array.from(li.querySelectorAll('a')).map((a) => a.getAttribute('href'));
      expect(hrefs).toContain('https://github.com/hugmesh/hugmesh-commons/packages');
      expect(hrefs).toContain('https://github.com/hugmesh/hugmesh-commons/releases/tag/v2.2.0-beta.1');
    });

    it('says "not released yet" for an unreleased library, links its repository and prints no snippet', () => {
      const li = el.querySelector('[data-package="parent"]')!;
      expect(text(li.querySelector('[data-testid="package-unreleased"]'))).toBe('not released yet');
      expect(text(li)).not.toContain('<version>');
      expect(li.querySelector('a')!.getAttribute('href')).toBe('https://github.com/hugmesh/hugmesh-parent');
    });

    it('never links anywhere relative, so it works on both hugmesh.github.io and hugmesh.net', () => {
      const sel = '#studio a[href], #images a[href], #packages a[href], #repos a[href]';
      for (const a of Array.from(el.querySelectorAll<HTMLAnchorElement>(sel))) {
        expect(a.getAttribute('href')).toMatch(/^https:\/\//);
      }
    });
  });

  describe('covers every repository that releases something', () => {
    let el: HTMLElement;
    beforeEach(() => (el = serve(published)));

    const repos = [
      sources.studio.repo,
      ...sources.images.map((i) => i.repo),
      ...sources.packages.map((p) => p.repo),
    ].filter((r, i, all) => all.indexOf(r) === i);

    it('links the Releases page of every repository in release-sources.json', () => {
      expect(repos.length).toBeGreaterThan(30);
      const rows = Array.from(el.querySelectorAll('#repos tr[data-repo]')).map((r) => r.getAttribute('data-repo'));
      expect(rows.sort()).toEqual([...repos].sort());
      for (const repo of repos) {
        const a = el.querySelector(`#repos tr[data-repo="${repo}"] a`)!;
        expect(a.getAttribute('href')).toBe(`https://github.com/${repo}/releases`);
      }
    });

    it('lists every image and every Maven package from release-sources.json', () => {
      for (const i of sources.images) {
        expect(el.querySelector(`#images [data-image="${i.id}"]`)).withContext(i.id).toBeTruthy();
      }
      for (const p of sources.packages) {
        expect(el.querySelector(`#packages [data-package="${p.id}"]`)).withContext(p.id).toBeTruthy();
      }
    });
  });

  describe('before anything is published', () => {
    let el: HTMLElement;
    beforeEach(() => (el = serve(empty)));

    it('says no Studio release is published yet and links the releases page', () => {
      const none = el.querySelector('[data-testid="studio-none"]');
      expect(text(none)).toContain('No Studio release has been published yet');
      expect(none?.querySelector('a')?.getAttribute('href')).toBe(
        'https://github.com/hugmesh/hugmesh-generator/releases',
      );
      expect(el.querySelector('[data-testid="primary-download"]')).toBeNull();
    });

    it('shows no download link at all, so there is nothing broken to click', () => {
      expect(el.querySelector('a[href*="/releases/download/"]')).toBeNull();
      expect(el.querySelector('a[href*="/packages/container/"]')).toBeNull();
      expect(text(el)).not.toContain('docker pull');
      expect(text(el)).not.toContain('<dependency>');
    });

    it('says in one line that no image is published, and still names every image', () => {
      expect(text(el.querySelector('[data-testid="images-status"]'))).toContain('No container image can be pulled yet');
      expect(el.querySelectorAll('#images [data-image]').length).toBe(empty.images.length);
      expect(el.querySelectorAll('#images ul.images').length).toBe(0);
    });

    it('marks every Maven package not released yet', () => {
      expect(el.querySelectorAll('[data-testid="package-unreleased"]').length).toBe(empty.packages.length);
    });
  });

  it('refuses to render damaged data rather than show wrong links', () => {
    const el = serve({ ...published, schema: 1 });
    expect(text(el)).toContain('Release information could not be read');
    expect(el.querySelector('#studio')).toBeNull();
  });

  it('says so when the site was built without release data', () => {
    http.expectOne('assets/releases.json').flush('', { status: 404, statusText: 'Not Found' });
    fixture.detectChanges();
    expect(text(fixture.nativeElement)).toContain('Release information is not available');
  });
});
