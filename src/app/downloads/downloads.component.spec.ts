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
    fixture.detectChanges();
  });

  afterEach(() => http.verify());

  function serve(body: object): HTMLElement {
    http.expectOne('assets/releases.json').flush(body);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  const text = (el: Element | null) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();

  describe('with a published Studio beta and two published images', () => {
    let el: HTMLElement;
    beforeEach(() => (el = serve(published)));

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

    it('shows a pull line, the digest and a cosign verify line for a published image', () => {
      const card = el.querySelector('[data-image="admin-ui"]')!;
      const t = text(card);
      expect(t).toContain('docker pull ghcr.io/hugmesh/hugmesh-admin-ui:0.3.0-beta.10');
      expect(t).toContain('cosign verify ghcr.io/hugmesh/hugmesh-admin-ui@sha256:dddd');
      expect(t).toContain('--certificate-identity-regexp');
      expect(t).toContain('gh attestation verify oci://ghcr.io/hugmesh/hugmesh-admin-ui@sha256:');
      expect(t).toContain('Beta 0.3.0-beta.10');
      expect(t).toContain('Signed with cosign; build provenance attested.');
    });

    it('lists the mesh-node image first, with its own signing identity', () => {
      const first = el.querySelector('#images .images li');
      expect(first?.getAttribute('data-image')).toBe('mesh-node');
      expect(text(first)).toContain('ghcr.io/hugmesh/hugmesh-mesh-node');
      expect(text(first)).toContain('mesh-node-release');
    });

    it('marks every unpublished image as such, with no pull line', () => {
      const cards = Array.from(el.querySelectorAll('#images li.unpublished'));
      expect(cards.length).toBe(published.images.length - 2);
      for (const c of cards) {
        expect(text(c)).toContain('Not published yet');
        expect(text(c)).not.toContain('docker pull');
      }
      expect(text(el.querySelector('[data-testid="images-status"]'))).toContain(
        `2 of ${published.images.length} images published`,
      );
    });

    it('never links anywhere relative, so it works on both hugmesh.github.io and hugmesh.net', () => {
      for (const a of Array.from(el.querySelectorAll<HTMLAnchorElement>('#studio a[href], #images a[href]'))) {
        expect(a.getAttribute('href')).toMatch(/^https:\/\//);
      }
    });
  });

  describe('before anything is published', () => {
    let el: HTMLElement;
    beforeEach(() => (el = serve(empty)));

    it('says no Studio beta is published yet and links the releases page', () => {
      const none = el.querySelector('[data-testid="studio-none"]');
      expect(text(none)).toContain('No Studio beta has been published yet');
      expect(none?.querySelector('a')?.getAttribute('href')).toBe(
        'https://github.com/hugmesh/hugmesh-generator/releases',
      );
      expect(el.querySelector('#studio a.btn')).toBeNull();
    });

    it('still lists every image by name, none with a pull line', () => {
      expect(el.querySelectorAll('#images li').length).toBe(empty.images.length);
      expect(text(el.querySelector('#images'))).not.toContain('docker pull');
      expect(text(el.querySelector('[data-testid="images-status"]'))).toContain(`0 of ${empty.images.length}`);
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
