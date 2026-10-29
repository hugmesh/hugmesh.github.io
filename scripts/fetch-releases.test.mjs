/**
 * The release-data generator, against recorded API and registry answers.
 *
 *   node --test scripts/fetch-releases.test.mjs
 *   UPDATE_FIXTURES=1 node --test scripts/fetch-releases.test.mjs   # rewrite the fixtures
 *
 * Nothing here touches the network: every request goes to a fake fetch that
 * answers from the tables below and records what was asked.
 *
 * THE POINT. The generator's output is what the Downloads page renders. Two
 * committed fixtures (src/app/downloads/testing/*.fixture.json) are produced by
 * the generator here and must equal what it produces now, and the page's own
 * Karma spec renders those same files. So a change to the generator that the
 * page cannot read fails one side or the other, instead of shipping.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildReleaseData,
  classifyStudioAsset,
  makeClient,
  parseSha256Sums,
  signingIdentity,
  FetchFailure,
} from './fetch-releases.mjs';
import { validateReleaseData } from '../src/app/downloads/release-data.ts';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FIXTURES = path.join(ROOT, 'src/app/downloads/testing');
const sources = JSON.parse(await readFile(path.join(ROOT, 'release-sources.json'), 'utf8'));
const NOW = new Date('2026-10-22T08:00:00Z');

const hex = (c) => c.repeat(64);
const SHA = { msi: hex('a'), flatpak: hex('b'), tar: hex('c') };
const ADMIN_DIGEST = `sha256:${hex('d')}`;
const NODE_DIGEST = `sha256:${hex('e')}`;
const V = '0.3.0-beta.2';
const DL = `https://github.com/hugmesh/hugmesh-generator/releases/download/studio-v${V}`;
const ASSET_API = 'https://api.github.com/repos/hugmesh/hugmesh-generator/releases/assets';
const OLD_DL = 'https://github.com/hugmesh/hugmesh-generator/releases/download/studio-v0.3.0-beta.1';

const asset = (id, name, size, digest) => ({
  id,
  name,
  size,
  url: `${ASSET_API}/${id}`,
  browser_download_url: `${DL}/${name}`,
  ...(digest ? { digest: `sha256:${digest}` } : {}),
});

const studioReleases = [
  {
    // A DRAFT with a higher version must never be shown.
    tag_name: 'studio-v0.4.0-beta.1',
    draft: true,
    prerelease: true,
    assets: [],
  },
  {
    tag_name: `studio-v${V}`,
    draft: false,
    prerelease: true,
    published_at: '2026-10-22T07:12:00Z',
    html_url: `https://github.com/hugmesh/hugmesh-generator/releases/tag/studio-v${V}`,
    assets: [
      asset(1, `hugmesh-studio-${V}-x64.msi`, 43_912_345, SHA.msi),
      asset(2, `hugmesh-studio-${V}-x86_64.flatpak`, 171_700_000),
      asset(3, `hugmesh-studio-${V}-linux-x86_64.tar.gz`, 96_400_000),
      asset(4, 'SHA256SUMS', 300),
      asset(5, 'SHA256SUMS.sigstore.json', 4000),
      asset(6, `hugmesh-studio-${V}-windows-x64.spdx.json`, 52_000),
      asset(8, `hugmesh-studio-${V}-linux-x86_64.spdx.json`, 61_000),
    ],
  },
  {
    // Older beta of the same line: beta.10 > beta.2 would be wrong here, so
    // use beta.1 and rely on SemVer ordering, not list order.
    tag_name: 'studio-v0.3.0-beta.1',
    draft: false,
    prerelease: true,
    published_at: '2026-10-21T07:12:00Z',
    html_url: 'https://github.com/hugmesh/hugmesh-generator/releases/tag/studio-v0.3.0-beta.1',
    // The OLDER release: it must stay downloadable from the archive list.
    assets: [
      {
        id: 21,
        name: 'hugmesh-studio-0.3.0-beta.1-x64.msi',
        size: 44_970_597,
        url: `${ASSET_API}/21`,
        browser_download_url: `${OLD_DL}/hugmesh-studio-0.3.0-beta.1-x64.msi`,
        digest: `sha256:${hex('9')}`,
      },
      {
        id: 22,
        name: 'SHA256SUMS',
        size: 300,
        url: `${ASSET_API}/22`,
        browser_download_url: `${OLD_DL}/SHA256SUMS`,
      },
      // Not a Studio download: never listed.
      { id: 23, name: 'notes.txt', size: 10, url: `${ASSET_API}/23`, browser_download_url: `${OLD_DL}/notes.txt` },
    ],
  },
  // Not a Studio release at all.
  { tag_name: 'mesh-node-v0.1.0-beta.1', draft: false, prerelease: true, assets: [] },
];

const sums =
  `${SHA.msi}  hugmesh-studio-${V}-x64.msi\n` +
  `${SHA.flatpak}  hugmesh-studio-${V}-x86_64.flatpak\n` +
  `${SHA.tar} *hugmesh-studio-${V}-linux-x86_64.tar.gz\n`;

const json = (body, status = 200, headers = {}) => ({ status, body: JSON.stringify(body), headers });

/** Answers for a world where Studio beta.2, admin-ui and mesh-node are published. */
function publishedWorld() {
  return {
    'GET https://api.github.com/repos/hugmesh/hugmesh-generator/releases?per_page=100': json(studioReleases),
    [`GET ${ASSET_API}/4`]: { status: 200, body: sums },
    [`GET https://api.github.com/repos/hugmesh/hugmesh-generator/attestations/sha256:${SHA.msi}`]: json({
      attestations: [{ bundle: {} }],
    }),
    [`GET https://api.github.com/repos/hugmesh/hugmesh-generator/attestations/sha256:${SHA.flatpak}`]: json({
      attestations: [{ bundle: {} }],
    }),
    // admin-ui: classic cosign .sig tag; attestation only in the API.
    'GET https://ghcr.io/v2/hugmesh/hugmesh-admin-ui/tags/list?n=1000': json({
      tags: ['main', 'beta', 'latest', 'sha-60b63df0a1b2', '0.3.0-beta.1', '0.3.0-beta.10', '0.3.0-beta.2', `sha256-${hex('d')}.sig`],
    }),
    'HEAD https://ghcr.io/v2/hugmesh/hugmesh-admin-ui/manifests/0.3.0-beta.10': {
      status: 200,
      body: '',
      headers: { 'docker-content-digest': ADMIN_DIGEST },
    },
    [`GET https://api.github.com/repos/hugmesh/hugmesh-admin-ui/attestations/${ADMIN_DIGEST}`]: json({
      attestations: [{}],
    }),
    'GET https://api.github.com/repos/hugmesh/hugmesh-admin-ui/releases/tags/v0.3.0-beta.10': json({
      html_url: 'https://github.com/hugmesh/hugmesh-admin-ui/releases/tag/v0.3.0-beta.10',
    }),
    // mesh-node: signature and provenance as OCI referrers behind the fallback tag.
    'GET https://ghcr.io/v2/hugmesh/hugmesh-mesh-node/tags/list?n=1000': json({
      tags: ['0.1.0-beta.1', `sha256-${hex('e')}`],
    }),
    'HEAD https://ghcr.io/v2/hugmesh/hugmesh-mesh-node/manifests/0.1.0-beta.1': {
      status: 200,
      body: '',
      headers: { 'docker-content-digest': NODE_DIGEST },
    },
    // The shape GHCR really serves behind the fallback tag (measured on
    // ghcr.io/aquasecurity/trivy:0.76.1): entries carry a digest and the artifactType
    // "empty" but NO annotations; the predicate type is on each referrer's own manifest.
    [`GET https://ghcr.io/v2/hugmesh/hugmesh-mesh-node/manifests/sha256-${hex('e')}`]: json({
      schemaVersion: 2,
      mediaType: 'application/vnd.oci.image.index.v1+json',
      manifests: [
        { mediaType: 'application/vnd.oci.image.manifest.v1+json', digest: `sha256:${hex('1')}`, artifactType: 'application/vnd.oci.empty.v1+json' },
        { mediaType: 'application/vnd.oci.image.manifest.v1+json', digest: `sha256:${hex('2')}`, artifactType: 'application/vnd.oci.empty.v1+json' },
        { mediaType: 'application/vnd.oci.image.manifest.v1+json', digest: `sha256:${hex('3')}`, artifactType: 'application/vnd.oci.empty.v1+json' },
      ],
    }),
    [`GET https://ghcr.io/v2/hugmesh/hugmesh-mesh-node/manifests/sha256:${hex('1')}`]: json({
      annotations: { 'dev.sigstore.bundle.predicateType': 'https://sigstore.dev/cosign/sign/v1' },
    }),
    [`GET https://ghcr.io/v2/hugmesh/hugmesh-mesh-node/manifests/sha256:${hex('2')}`]: json({
      annotations: { 'dev.sigstore.bundle.predicateType': 'https://slsa.dev/provenance/v1' },
    }),
    [`GET https://ghcr.io/v2/hugmesh/hugmesh-mesh-node/manifests/sha256:${hex('3')}`]: json({
      annotations: { 'dev.sigstore.bundle.predicateType': 'https://spdx.dev/Document/v2.3' },
    }),
    // gateway: a package that exists but has only dev tags (main / sha-…): not published.
    'GET https://ghcr.io/v2/hugmesh/hugmesh-gateway/tags/list?n=1000': json({ tags: ['main', 'sha-0123456789ab', 'latest'] }),
    // commons: a Maven library with a released beta, a newer DRAFT, and an older beta.
    'GET https://api.github.com/repos/hugmesh/hugmesh-commons/releases?per_page=100': json([
      { tag_name: 'v2.3.0-beta.1', draft: true, prerelease: true, assets: [] },
      {
        tag_name: 'v2.2.0-beta.1',
        draft: false,
        prerelease: true,
        published_at: '2026-10-22T05:00:00Z',
        html_url: 'https://github.com/hugmesh/hugmesh-commons/releases/tag/v2.2.0-beta.1',
        assets: [],
      },
      {
        tag_name: 'v2.1.0',
        draft: false,
        prerelease: false,
        published_at: '2026-09-01T05:00:00Z',
        html_url: 'https://github.com/hugmesh/hugmesh-commons/releases/tag/v2.1.0',
        assets: [],
      },
    ]),
  };
}

/**
 * A fetch that answers from `table`, with sensible defaults for everything the
 * table does not name: GitHub API 404, registry token 200, registry 401 (what
 * a private or absent package looks like to an anonymous client).
 */
function fakeFetch(table) {
  const calls = [];
  const fn = async (url, init = {}) => {
    const method = init.method ?? 'GET';
    const key = `${method} ${url}`;
    calls.push({ key, headers: init.headers ?? {} });
    let r = table[key];
    if (typeof r === 'function') r = r();
    if (r instanceof Error) throw r;
    if (!r) {
      if (url.startsWith('https://ghcr.io/token?')) r = json({ token: 'anonymous-pull' });
      else if (url.startsWith('https://ghcr.io/v2/')) r = json({ errors: [{ code: 'UNAUTHORIZED' }] }, 401);
      else if (url.startsWith('https://api.github.com/')) r = json({ message: 'Not Found' }, 404);
      else throw new Error(`unexpected request ${key}`);
    }
    return new Response(method === 'HEAD' ? null : r.body, { status: r.status, headers: r.headers ?? {} });
  };
  fn.calls = calls;
  return fn;
}

const client = (fetchImpl, token) => makeClient({ fetchImpl, token, sleep: async () => {} });

async function matchFixture(name, data) {
  const file = path.join(FIXTURES, name);
  const text = JSON.stringify(data, null, 2) + '\n';
  if (process.env.UPDATE_FIXTURES) await writeFile(file, text);
  assert.equal(text, await readFile(file, 'utf8'), `${name} is stale: run with UPDATE_FIXTURES=1 and review the diff`);
}

test('published world: newest Studio beta, its files, checksums and signing facts', async () => {
  const fetchImpl = fakeFetch(publishedWorld());
  const data = await buildReleaseData({ sources, client: client(fetchImpl, 'site-token'), now: NOW });
  assert.deepEqual(validateReleaseData(data), []);

  const s = data.studio;
  assert.equal(s.version, V, 'the draft 0.4.0 and the older beta.1 must both lose to beta.2');
  assert.equal(s.tag, `studio-v${V}`);
  assert.equal(s.prerelease, true);
  assert.equal(s.published, '2026-10-22');
  assert.deepEqual(
    s.installers.map((i) => [i.platform, i.kind, i.file, i.sha256, i.attested]),
    [
      ['windows', 'msi', `hugmesh-studio-${V}-x64.msi`, SHA.msi, true],
      ['linux', 'flatpak', `hugmesh-studio-${V}-x86_64.flatpak`, SHA.flatpak, true],
      ['linux', 'tarball', `hugmesh-studio-${V}-linux-x86_64.tar.gz`, SHA.tar, false],
    ],
  );
  for (const i of s.installers) assert.ok(i.url.startsWith(`${DL}/`), `${i.file} must link to the release`);
  assert.deepEqual(
    s.installers.map((i) => i.sbom?.file ?? null),
    [`hugmesh-studio-${V}-windows-x64.spdx.json`, null, `hugmesh-studio-${V}-linux-x86_64.spdx.json`],
    'the Windows SBOM belongs to the MSI, the Linux one to the tarball; the Flatpak has none',
  );
  assert.deepEqual(s.checksums, { file: 'SHA256SUMS', url: `${DL}/SHA256SUMS` });
  assert.deepEqual(s.checksumsSignature, { file: 'SHA256SUMS.sigstore.json', url: `${DL}/SHA256SUMS.sigstore.json` });
  assert.equal(s.authenticode, false, 'no manifest file at all: the MSI must not be called signed');
  assert.match(
    'https://github.com/hugmesh/hugmesh-generator/.github/workflows/studio-release.yml@refs/tags/studio-v0.3.0-beta.2',
    new RegExp(s.identity.regexp),
  );
  assert.doesNotMatch(
    'https://github.com/hugmesh/hugmesh-generator/.github/workflows/studio-release.yml@refs/heads/main',
    new RegExp(s.identity.regexp),
    'a build from a branch must not pass as a release',
  );

  const admin = data.images.find((i) => i.id === 'admin-ui');
  assert.equal(admin.version, '0.3.0-beta.10', 'beta.10 sorts above beta.2; dev tags are never versions');
  assert.equal(admin.digest, ADMIN_DIGEST);
  assert.equal(admin.signed, true);
  assert.equal(admin.attested, true);
  assert.equal(admin.notesUrl, 'https://github.com/hugmesh/hugmesh-admin-ui/releases/tag/v0.3.0-beta.10');

  const node = data.images.find((i) => i.id === 'mesh-node');
  assert.equal(node.version, '0.1.0-beta.1');
  assert.equal(node.signed, true, 'cosign signature found through the referrers fallback tag');
  assert.equal(node.attested, true, 'provenance found in the registry, no API call needed');
  assert.match(
    'https://github.com/hugmesh/hugmesh-generator/.github/workflows/mesh-node-release.yml@refs/tags/mesh-node-v0.1.0-beta.1',
    new RegExp(node.identity.regexp),
  );
  assert.equal(node.notesUrl, null, 'no GitHub release answered for that tag');

  const gateway = data.images.find((i) => i.id === 'gateway');
  assert.equal(gateway.version, null, 'main / sha-… / latest are not published versions');

  assert.equal(data.images.length, sources.images.length);
  assert.equal(data.images.filter((i) => i.version).length, 2);

  // Every older Studio release stays reachable, with only its Studio files.
  assert.deepEqual(
    data.studioArchive.map((a) => [a.version, a.files.map((f) => [f.file, f.sha256])]),
    [['0.3.0-beta.1', [['hugmesh-studio-0.3.0-beta.1-x64.msi', hex('9')], ['SHA256SUMS', null]]]],
    'the newest release is not repeated, the draft never appears, notes.txt is not a download',
  );
  for (const f of data.studioArchive[0].files) assert.ok(f.url.startsWith(`${OLD_DL}/`));

  const commons = data.packages.find((p) => p.id === 'commons');
  assert.deepEqual(
    [commons.groupId, commons.artifactId, commons.version, commons.prerelease, commons.published, commons.notesUrl],
    ['net.hugmesh', 'hugmesh-commons', '2.2.0-beta.1', true, '2026-10-22', 'https://github.com/hugmesh/hugmesh-commons/releases/tag/v2.2.0-beta.1'],
    'the draft 2.3.0 is invisible; 2.2.0-beta.1 outranks 2.1.0 by version',
  );
  assert.equal(data.packages.find((p) => p.id === 'parent').version, null, 'no release: not released yet');
  assert.equal(data.packages.find((p) => p.id === 'parent').packaging, 'pom');

  assert.deepEqual(
    data.repos.find((r) => r.repo === 'hugmesh/hugmesh-generator'),
    {
      repo: 'hugmesh/hugmesh-generator',
      provides: ['studio', 'image'],
      latest: {
        tag: `studio-v${V}`,
        prerelease: true,
        published: '2026-10-22',
        url: `https://github.com/hugmesh/hugmesh-generator/releases/tag/studio-v${V}`,
      },
    },
  );
  assert.equal(data.repos.find((r) => r.repo === 'hugmesh/hugmesh-gateway').latest, null);
  // The Releases API is asked once per repository, however many items share it.
  const generatorListCalls = fetchImpl.calls.filter((c) => c.key.endsWith('/repos/hugmesh/hugmesh-generator/releases?per_page=100'));
  assert.equal(generatorListCalls.length, 1);

  // The registry is read anonymously: the site's GitHub token must never be sent to ghcr.io.
  for (const c of fetchImpl.calls.filter((c) => c.key.includes('ghcr.io'))) {
    assert.notEqual(c.headers.authorization, 'Bearer site-token', c.key);
  }
  await matchFixture('releases.published.fixture.json', data);
});

test('nothing published (the state before the first release): valid, and says so', async () => {
  const data = await buildReleaseData({ sources, client: client(fakeFetch({})), now: NOW });
  assert.deepEqual(validateReleaseData(data), []);
  assert.equal(data.studio, null);
  assert.equal(data.studioRepo, 'hugmesh/hugmesh-generator');
  assert.ok(data.images.every((i) => i.version === null && i.digest === null && !i.signed && !i.attested));
  assert.deepEqual(data.studioArchive, []);
  assert.ok(data.packages.every((p) => p.version === null && p.notesUrl === null));
  assert.ok(data.repos.every((r) => r.latest === null));
  await matchFixture('releases.empty.fixture.json', data);
});

test('a server error is retried and then FAILS the build rather than claiming nothing is published', async () => {
  let n = 0;
  const fetchImpl = fakeFetch({
    'GET https://api.github.com/repos/hugmesh/hugmesh-generator/releases?per_page=100': () => {
      n++;
      return json({ message: 'boom' }, 503);
    },
  });
  await assert.rejects(buildReleaseData({ sources, client: client(fetchImpl), now: NOW }), FetchFailure);
  assert.equal(n, 3);
});

test('a rate limit FAILS the build', async () => {
  const fetchImpl = fakeFetch({
    'GET https://api.github.com/repos/hugmesh/hugmesh-generator/releases?per_page=100': json(
      { message: 'API rate limit exceeded' },
      403,
      { 'x-ratelimit-remaining': '0' },
    ),
  });
  await assert.rejects(buildReleaseData({ sources, client: client(fetchImpl), now: NOW }), /rate limited/);
});

test('a network failure on an image FAILS the build and names the image', async () => {
  const fetchImpl = fakeFetch({
    'GET https://ghcr.io/v2/hugmesh/hugmesh-admin-ui/tags/list?n=1000': new TypeError('fetch failed'),
  });
  await assert.rejects(
    buildReleaseData({ sources, client: client(fetchImpl), now: NOW }),
    /ghcr\.io\/hugmesh\/hugmesh-admin-ui: .*fetch failed/,
  );
});

test('SHA256SUMS disagreeing with GitHub’s own digest FAILS the build', async () => {
  const world = publishedWorld();
  world[`GET ${ASSET_API}/4`] = { status: 200, body: sums.replace(SHA.msi, hex('f')) };
  await assert.rejects(
    buildReleaseData({ sources, client: client(fakeFetch(world)), now: NOW }),
    /SHA256SUMS says f+ but GitHub's digest is a+/,
  );
});

test('the release workflow saying authenticode:true is the only way the MSI is called signed', async () => {
  const world = publishedWorld();
  const rel = structuredClone(studioReleases);
  // studio-release.yml (feat/signed-studio-release) attaches releases.json with this field.
  rel[1].assets.push(asset(7, 'releases.json', 900));
  world['GET https://api.github.com/repos/hugmesh/hugmesh-generator/releases?per_page=100'] = json(rel);
  world[`GET ${ASSET_API}/7`] = json({ version: V, authenticode: true });
  const data = await buildReleaseData({ sources, client: client(fakeFetch(world)), now: NOW });
  assert.equal(data.studio.authenticode, true);

  world[`GET ${ASSET_API}/7`] = { status: 200, body: 'not json' };
  const bad = await buildReleaseData({ sources, client: client(fakeFetch(world)), now: NOW });
  assert.equal(bad.studio.authenticode, false, 'an unreadable manifest never turns into a claim');

  world[`GET ${ASSET_API}/7`] = json({ version: V, authenticode: 'yes' });
  const truthy = await buildReleaseData({ sources, client: client(fakeFetch(world)), now: NOW });
  assert.equal(truthy.studio.authenticode, false, 'only literal true counts');
});

test('a permission refusal on an attestation lookup is "not attested", not a failed deploy', async () => {
  const world = publishedWorld();
  world[`GET https://api.github.com/repos/hugmesh/hugmesh-admin-ui/attestations/${ADMIN_DIGEST}`] = json(
    { message: 'Resource not accessible by integration' },
    403,
  );
  const data = await buildReleaseData({ sources, client: client(fakeFetch(world)), now: NOW });
  assert.equal(data.images.find((i) => i.id === 'admin-ui').attested, false);
});

test('the validator rejects what the page cannot render', () => {
  const ok = {
    schema: 3,
    generated: NOW.toISOString(),
    studioRepo: 'hugmesh/hugmesh-generator',
    studio: null,
    studioArchive: [],
    images: [],
    packages: [],
    repos: [],
  };
  assert.deepEqual(validateReleaseData(ok), []);
  assert.notDeepEqual(validateReleaseData({ ...ok, schema: 2 }), []);
  assert.notDeepEqual(validateReleaseData({ ...ok, packages: undefined }), [], 'packages is required');
  assert.notDeepEqual(validateReleaseData({ ...ok, repos: undefined }), [], 'repos is required');
  const pkg = {
    id: 'commons', label: 'Commons', groupId: 'net.hugmesh', artifactId: 'hugmesh-commons', packaging: 'jar',
    repo: 'hugmesh/hugmesh-commons', version: null, prerelease: false, published: null, notesUrl: null,
  };
  assert.deepEqual(validateReleaseData({ ...ok, packages: [pkg] }), []);
  assert.notDeepEqual(validateReleaseData({ ...ok, packages: [{ ...pkg, packaging: 'war' }] }), []);
  assert.notDeepEqual(
    validateReleaseData({ ...ok, packages: [{ ...pkg, notesUrl: 'https://github.com/x' }] }),
    [],
    'release facts without a version would render a link to nothing',
  );
  assert.notDeepEqual(validateReleaseData({ ...ok, packages: [pkg, pkg] }), [], 'duplicate package');
  assert.notDeepEqual(
    validateReleaseData({ ...ok, repos: [{ repo: 'hugmesh/x', provides: ['wheel'], latest: null }] }),
    [],
  );
  assert.notDeepEqual(validateReleaseData({ ...ok, images: undefined }), []);
  const img = {
    id: 'x', label: 'X', group: 'ui', repo: 'hugmesh/x', image: 'ghcr.io/hugmesh/x',
    version: '0.1.0-beta.1', prerelease: true, digest: `sha256:${hex('1')}`, signed: true, attested: true,
    identity: signingIdentity('hugmesh/x', 'release.yml', 'v'), notesUrl: null,
  };
  assert.deepEqual(validateReleaseData({ ...ok, images: [img] }), []);
  assert.notDeepEqual(validateReleaseData({ ...ok, images: [{ ...img, digest: null }] }), [], 'version without digest');
  assert.notDeepEqual(validateReleaseData({ ...ok, images: [{ ...img, image: 'docker.io/x' }] }), []);
  assert.notDeepEqual(validateReleaseData({ ...ok, images: [img, img] }), [], 'duplicate image');
  assert.notDeepEqual(
    validateReleaseData({ ...ok, images: [{ ...img, notesUrl: '/relative' }] }),
    [],
    'relative links break on one of the two hosts',
  );
});

test('asset classification and SHA256SUMS parsing', () => {
  assert.equal(classifyStudioAsset('hugmesh-studio-1.0.0-x64.msi', '0.3.0-beta.1'), null, 'another version');
  assert.equal(classifyStudioAsset('hugmesh-studio-0.3.0-beta.1-x64.msi.sha256', '0.3.0-beta.1'), null);
  assert.equal(classifyStudioAsset('hugmesh-studio-0.3.0-beta.1-x64.msi', '0.3.0-beta.1').kind, 'msi');
  const m = parseSha256Sums(`${hex('a')}  a.msi\r\n${hex('B')} *b.flatpak\nnot a line\n`);
  assert.equal(m.get('a.msi'), hex('a'));
  assert.equal(m.get('b.flatpak'), hex('b'));
  assert.equal(m.size, 2);
});
