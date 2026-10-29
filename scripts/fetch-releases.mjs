#!/usr/bin/env node
/**
 * Build src/assets/releases.json from what is ACTUALLY published.
 *
 *   node scripts/fetch-releases.mjs [--out src/assets/releases.json] [--sources release-sources.json]
 *
 * WHY THIS EXISTS. The Downloads page used to read a releases.json that a
 * maintainer copied in by hand after each Studio release. Hand-copied version
 * numbers go stale the first time somebody forgets. Now the Pages build runs
 * this script, so every deploy carries whatever is newest at that moment:
 *
 *   Studio  newest non-draft GitHub Release of hugmesh-generator whose tag starts
 *           `studio-v` (SemVer order, betas included); its installers, sizes and
 *           SHA-256 values (from the release's own SHA256SUMS), the Sigstore bundle
 *           that signs SHA256SUMS, and whether GitHub holds a provenance
 *           attestation for each installer.
 *           Every older `studio-v*` release too (studioArchive), so nothing that was
 *           ever published becomes unreachable from the page.
 *   Images  for each image in release-sources.json, the newest SemVer tag in the
 *           GHCR registry, its manifest digest, whether a cosign signature exists
 *           for that digest, whether GitHub holds an attestation for it, and the
 *           matching GitHub Release (if any).
 *   Maven   for each library in release-sources.json, the newest `v<version>`
 *           GitHub Release of its repository (see fetchPackage for why).
 *   Repos   every repository any of the above comes from, with its newest release,
 *           so the page can link each one's Releases page.
 *
 * WHAT COUNTS AS "NOT PUBLISHED" AND WHAT IS AN ERROR. A 404 from the releases
 * API, or a registry that refuses to list a package (401/403/404), means
 * "nothing a visitor can download": the item is written with version null and
 * the page says "not published yet". That is the normal state before the first
 * release, and it is also what a private repository or package looks like to an
 * anonymous visitor, which is the truth the page should tell. Anything else (a
 * timeout, a 5xx, a rate limit, a checksum that disagrees with GitHub's own
 * digest) FAILS the script after retries. In pages.yml a failure stops the
 * deploy, so the site keeps serving the previous, still-correct data instead of
 * a page that suddenly claims nothing is published.
 *
 * CREDENTIALS. The registry is always read anonymously, because that is what a
 * visitor's `docker pull` sees. The GitHub API uses GITHUB_TOKEN or GH_TOKEN
 * when set (only for the rate limit: the site's own Actions token can read any
 * public repository), and anonymously otherwise (60 requests an hour, enough
 * only while little is published). Run locally with a personal token and you
 * may see PRIVATE releases that a visitor cannot download; the Pages build uses
 * the site's own token, which cannot.
 *
 * The output is validated with the same function the page uses
 * (src/app/downloads/release-data.ts) before it is written.
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  ACTIONS_OIDC_ISSUER,
  RELEASE_DATA_SCHEMA,
  compareSemver,
  isSemver,
  validateReleaseData,
} from '../src/app/downloads/release-data.ts';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const API = 'https://api.github.com';
const REGISTRY = 'https://ghcr.io';

/** Manifest media types a tag can point at; GHCR needs to be told it may answer with any. */
const MANIFEST_ACCEPT = [
  'application/vnd.oci.image.index.v1+json',
  'application/vnd.docker.distribution.manifest.list.v2+json',
  'application/vnd.oci.image.manifest.v1+json',
  'application/vnd.docker.distribution.manifest.v2+json',
].join(', ');

const COSIGN_SIGN_PREDICATE = 'https://sigstore.dev/cosign/sign/v1';

/** Not "not published": something is broken and the deploy must not go ahead. */
export class FetchFailure extends Error {}

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** The identity a keyless signature from that workflow, on a release tag, carries. */
export function signingIdentity(repo, workflow, tagPrefix) {
  return {
    regexp:
      `^https://github\\.com/${escapeRe(repo)}/\\.github/workflows/${escapeRe(workflow)}` +
      `@refs/tags/${escapeRe(tagPrefix)}`,
    issuer: ACTIONS_OIDC_ISSUER,
  };
}

export function humanSize(bytes) {
  const mb = bytes / 1e6;
  return mb >= 10 ? `${mb.toFixed(0)} MB` : `${mb.toFixed(1)} MB`;
}

/** `<hex>  <name>` (or `<hex> *<name>`) lines, as sha256sum writes them. */
export function parseSha256Sums(text) {
  const out = new Map();
  for (const line of text.split(/\r?\n/)) {
    const m = /^([0-9a-fA-F]{64}) [ *](.+)$/.exec(line.trim());
    if (m) out.set(m[2].trim(), m[1].toLowerCase());
  }
  return out;
}

/** What kind of Studio download a release asset is, or null when it is not one. */
export function classifyStudioAsset(name, version) {
  const stem = `hugmesh-studio-${version}-`;
  if (!name.startsWith(stem)) return null;
  if (name.endsWith('.msi')) {
    return { platform: 'windows', kind: 'msi', label: 'Windows installer (MSI, 64-bit)', sbom: `${stem}windows-x64.spdx.json` };
  }
  if (name.endsWith('.flatpak')) {
    return { platform: 'linux', kind: 'flatpak', label: 'Linux Flatpak bundle (x86_64)', sbom: null };
  }
  if (name.endsWith('.tar.gz')) {
    return { platform: 'linux', kind: 'tarball', label: 'Linux portable archive (tar.gz, x86_64)', sbom: `${stem}linux-x86_64.spdx.json` };
  }
  return null;
}

const KIND_ORDER = { msi: 0, flatpak: 1, tarball: 2 };
const SIGNATURE_NAMES = ['SHA256SUMS.sigstore.json', 'SHA256SUMS.bundle'];

/**
 * An HTTP client with retries over an injectable fetch, so the tests can serve
 * recorded responses and nothing in them touches the network.
 */
export function makeClient({ fetchImpl = globalThis.fetch, token, sleep, attempts = 3, log = () => {} } = {}) {
  const wait = sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));

  async function request(url, { headers = {}, method = 'GET', accept404 = true, okStatuses = [] } = {}) {
    let lastError;
    for (let i = 1; i <= attempts; i++) {
      let res;
      try {
        res = await fetchImpl(url, { method, headers, redirect: 'follow', signal: AbortSignal.timeout(30_000) });
      } catch (e) {
        lastError = new FetchFailure(`${method} ${url}: ${e?.message ?? e}`);
        log(`retry ${i}/${attempts}: ${lastError.message}`);
        if (i < attempts) await wait(2000 * i);
        continue;
      }
      const limited =
        res.status === 429 ||
        (res.status === 403 && res.headers.get('x-ratelimit-remaining') === '0');
      if (res.ok || okStatuses.includes(res.status) || (accept404 && res.status === 404)) return res;
      if (limited || res.status >= 500) {
        lastError = new FetchFailure(`${method} ${url}: HTTP ${res.status}${limited ? ' (rate limited)' : ''}`);
        log(`retry ${i}/${attempts}: ${lastError.message}`);
        if (i < attempts) await wait(2000 * i);
        continue;
      }
      return res;
    }
    throw lastError;
  }

  const ghHeaders = (accept = 'application/vnd.github+json') => ({
    accept,
    'x-github-api-version': '2022-11-28',
    'user-agent': 'hugmesh-site-release-fetch',
    ...(token ? { authorization: `Bearer ${token}` } : {}),
  });

  return {
    /** JSON from the GitHub API, or null on 404. */
    async gh(pathname) {
      const res = await request(`${API}${pathname}`, { headers: ghHeaders() });
      if (res.status === 404) return null;
      if (!res.ok) throw new FetchFailure(`GET ${pathname}: HTTP ${res.status}`);
      return res.json();
    },
    /**
     * JSON from the GitHub API for an EXTRA fact (an attestation, a release
     * note): null on 404 and also on a permission refusal (401/403 that is not
     * a rate limit), because a missing extra must not stop a deploy. The page
     * then simply does not claim it.
     */
    async ghOptional(pathname) {
      const res = await request(`${API}${pathname}`, { headers: ghHeaders(), okStatuses: [401, 403] });
      if (res.status === 401 || res.status === 403) {
        log(`no access to ${pathname} (HTTP ${res.status}); treated as absent`);
        return null;
      }
      if (res.status === 404) return null;
      if (!res.ok) throw new FetchFailure(`GET ${pathname}: HTTP ${res.status}`);
      return res.json();
    },
    /** A release asset's bytes as text (through the API, so it also works with a token). */
    async asset(assetApiUrl) {
      const res = await request(assetApiUrl, { headers: ghHeaders('application/octet-stream') });
      if (!res.ok) throw new FetchFailure(`GET ${assetApiUrl}: HTTP ${res.status}`);
      return res.text();
    },
    /** Anonymous pull token for one GHCR repository, or null if the registry refuses. */
    async registryToken(name) {
      const res = await request(
        `${REGISTRY}/token?scope=repository:${name}:pull&service=ghcr.io`,
        { okStatuses: [401, 403] },
      );
      if (!res.ok) return null;
      const body = await res.json();
      return typeof body?.token === 'string' ? body.token : null;
    },
    /** Every tag of a GHCR repository, or null when it is absent or not public. */
    async tags(name, bearer) {
      const tags = [];
      let next = `${REGISTRY}/v2/${name}/tags/list?n=1000`;
      for (let page = 0; next && page < 50; page++) {
        const res = await request(next, {
          headers: { authorization: `Bearer ${bearer}` },
          okStatuses: [401, 403],
        });
        if (res.status === 401 || res.status === 403 || res.status === 404) return null;
        if (!res.ok) throw new FetchFailure(`GET ${next}: HTTP ${res.status}`);
        const body = await res.json();
        tags.push(...(Array.isArray(body?.tags) ? body.tags : []));
        const link = res.headers.get('link');
        const m = link && /<([^>]+)>\s*;\s*rel="next"/.exec(link);
        next = m ? new URL(m[1], REGISTRY).toString() : null;
      }
      return tags;
    },
    /** The manifest digest a tag resolves to. */
    async digest(name, tag, bearer) {
      const url = `${REGISTRY}/v2/${name}/manifests/${tag}`;
      const headers = { authorization: `Bearer ${bearer}`, accept: MANIFEST_ACCEPT };
      let res = await request(url, { method: 'HEAD', headers });
      let d = res.headers.get('docker-content-digest');
      if (!d && res.ok) {
        res = await request(url, { headers });
        d = res.headers.get('docker-content-digest');
      }
      if (!res.ok || !d || !/^sha256:[0-9a-f]{64}$/.test(d)) {
        throw new FetchFailure(`${name}:${tag} has no readable digest (HTTP ${res.status})`);
      }
      return d;
    },
    /** A manifest body as JSON (used for the referrers fallback tag), or null. */
    async manifest(name, ref, bearer) {
      const res = await request(`${REGISTRY}/v2/${name}/manifests/${ref}`, {
        headers: { authorization: `Bearer ${bearer}`, accept: MANIFEST_ACCEPT },
        okStatuses: [401, 403],
      });
      if (!res.ok) return null;
      return res.json();
    },
  };
}

/** Does GitHub hold an attestation for this digest in this repository? */
async function hasAttestation(client, repo, digest) {
  const body = await client.ghOptional(`/repos/${repo}/attestations/${digest}`);
  return Array.isArray(body?.attestations) && body.attestations.length > 0;
}

/**
 * Every non-draft release of a repository whose tag is `<tagPrefix><SemVer>`,
 * newest version first. Drafts are invisible to visitors, so they are never listed.
 */
export function releasesWithPrefix(releases, tagPrefix) {
  return (releases ?? [])
    .filter((r) => !r.draft && typeof r.tag_name === 'string' && r.tag_name.startsWith(tagPrefix))
    .map((r) => ({ r, version: r.tag_name.slice(tagPrefix.length) }))
    .filter((c) => isSemver(c.version))
    .sort((a, b) => compareSemver(b.version, a.version));
}

const day = (r) => String(r.published_at ?? r.created_at).slice(0, 10);

/** The Releases API for one repository, asked once per build however many items share it. */
export function releaseCache(client) {
  const cache = new Map();
  return (repo) => {
    if (!cache.has(repo)) cache.set(repo, client.gh(`/repos/${repo}/releases?per_page=100`).then((r) => r ?? []));
    return cache.get(repo);
  };
}

export async function fetchStudio(client, src, releasesOf = releaseCache(client)) {
  const candidates = releasesWithPrefix(await releasesOf(src.repo), src.tagPrefix);
  if (!candidates.length) return null;
  const { r, version } = candidates[0];
  const assets = Array.isArray(r.assets) ? r.assets : [];
  const byName = new Map(assets.map((a) => [a.name, a]));

  const sumsAsset = byName.get('SHA256SUMS');
  const sums = sumsAsset ? parseSha256Sums(await client.asset(sumsAsset.url)) : new Map();
  const sigAsset = SIGNATURE_NAMES.map((n) => byName.get(n)).find(Boolean);
  // Whether the MSI was Authenticode-signed cannot be read from the API: the
  // release workflow says so in a small JSON file it attaches (release-manifest.json,
  // or the releases.json studio-release.yml writes). Absent, unreadable, or
  // anything but literally true means "not signed": never claim what we cannot see.
  let authenticode = false;
  const manifestAsset = byName.get('release-manifest.json') ?? byName.get('releases.json');
  if (manifestAsset) {
    try {
      authenticode = JSON.parse(await client.asset(manifestAsset.url))?.authenticode === true;
    } catch (e) {
      if (e instanceof FetchFailure) throw e;
      authenticode = false;
    }
  }

  const installers = [];
  for (const a of assets) {
    const kind = classifyStudioAsset(a.name, version);
    if (!kind) continue;
    const fromSums = sums.get(a.name) ?? null;
    const fromApi =
      typeof a.digest === 'string' && /^sha256:[0-9a-f]{64}$/.test(a.digest) ? a.digest.slice(7) : null;
    if (fromSums && fromApi && fromSums !== fromApi) {
      throw new FetchFailure(
        `${a.name}: SHA256SUMS says ${fromSums} but GitHub's digest is ${fromApi}; refusing to publish either`,
      );
    }
    const sha256 = fromSums ?? fromApi;
    const sbomAsset = kind.sbom ? byName.get(kind.sbom) : undefined;
    installers.push({
      platform: kind.platform,
      kind: kind.kind,
      label: kind.label,
      file: a.name,
      url: a.browser_download_url,
      size: humanSize(a.size),
      bytes: a.size,
      sha256,
      attested: sha256 ? await hasAttestation(client, src.repo, `sha256:${sha256}`) : false,
      sbom: sbomAsset ? { file: sbomAsset.name, url: sbomAsset.browser_download_url } : null,
    });
  }
  installers.sort((x, y) => KIND_ORDER[x.kind] - KIND_ORDER[y.kind] || x.file.localeCompare(y.file));

  const file = (a) => (a ? { file: a.name, url: a.browser_download_url } : null);
  return {
    repo: src.repo,
    tag: r.tag_name,
    version,
    prerelease: Boolean(r.prerelease) || version.includes('-'),
    published: day(r),
    notesUrl: r.html_url,
    installers,
    checksums: file(sumsAsset),
    checksumsSignature: file(sigAsset),
    identity: signingIdentity(src.repo, src.workflow, src.tagPrefix),
    authenticode,
  };
}

/** Release version tags only: X.Y.Z or X.Y.Z-beta.N. Not main, sha-…, beta or latest. */
const VERSION_TAG = /^\d+\.\d+\.\d+(?:-beta\.\d+)?$/;

export async function fetchImage(client, src) {
  const name = src.image.replace(/^ghcr\.io\//, '');
  const base = {
    id: src.id,
    label: src.label,
    group: src.group,
    repo: src.repo,
    image: src.image,
    identity: signingIdentity(src.repo, src.workflow, src.tagPrefix),
  };
  const none = { ...base, version: null, prerelease: false, digest: null, signed: false, attested: false, notesUrl: null };

  const bearer = await client.registryToken(name);
  if (!bearer) return none;
  const tags = await client.tags(name, bearer);
  if (!tags) return none;
  const versions = tags.filter((t) => VERSION_TAG.test(t)).sort((a, b) => compareSemver(b, a));
  if (!versions.length) return none;
  const version = versions[0];
  const digest = await client.digest(name, version, bearer);
  const hex = digest.slice(7);

  // cosign's classic layout stores the signature under the tag sha256-<hex>.sig.
  // Newer cosign (and attest-build-provenance with push-to-registry) use OCI
  // referrers, which GHCR serves through the fallback tag sha256-<hex>: read the
  // index behind it and look at what each entry says it is.
  let signed = tags.includes(`sha256-${hex}.sig`);
  let attested = false;
  if (tags.includes(`sha256-${hex}`)) {
    const index = await client.manifest(name, `sha256-${hex}`, bearer);
    // GHCR's fallback index lists each referrer by digest and artifactType ONLY;
    // what the referrer is (signature or provenance) is an annotation on the
    // referrer's own manifest. Measured on ghcr.io/aquasecurity/trivy:0.76.1,
    // 2026-10-21. A real referrers-API answer does carry the annotations inline,
    // so use them when present and fetch the manifest otherwise. Capped: a
    // digest with dozens of referrers is not worth dozens of requests per build.
    // The index's own artifactType is no guide either: GHCR reports
    // application/vnd.oci.empty.v1+json there for what is really a Sigstore bundle.
    const entries = (Array.isArray(index?.manifests) ? index.manifests : []).slice(0, 12);
    for (const m of entries) {
      let predicate = m?.annotations?.['dev.sigstore.bundle.predicateType'];
      if (!predicate && typeof m?.digest === 'string' && /^sha256:[0-9a-f]{64}$/.test(m.digest)) {
        const ref = await client.manifest(name, m.digest, bearer);
        predicate = ref?.annotations?.['dev.sigstore.bundle.predicateType'];
      }
      if (predicate === COSIGN_SIGN_PREDICATE) signed = true;
      else if (typeof predicate === 'string' && predicate.startsWith('https://slsa.dev/provenance/')) attested = true;
    }
  }
  if (!attested) attested = await hasAttestation(client, src.repo, digest);

  const rel = await client.ghOptional(`/repos/${src.repo}/releases/tags/${encodeURIComponent(src.tagPrefix + version)}`);
  return {
    ...base,
    version,
    prerelease: version.includes('-'),
    digest,
    signed,
    attested,
    notesUrl: rel?.html_url ?? null,
  };
}

/**
 * Every Studio release except the newest, newest first: the files a visitor can
 * still download from each, with GitHub's own SHA-256 where the API reports one.
 * Lighter than the newest release on purpose (no attestation lookups): it is an
 * archive, and the page sends people to each release's notes for the rest.
 */
export async function fetchStudioArchive(src, releasesOf) {
  const older = releasesWithPrefix(await releasesOf(src.repo), src.tagPrefix).slice(1);
  return older.map(({ r, version }) => {
    const assets = Array.isArray(r.assets) ? r.assets : [];
    const files = assets
      .filter(
        (a) =>
          classifyStudioAsset(a.name, version) || a.name === 'SHA256SUMS' || SIGNATURE_NAMES.includes(a.name),
      )
      // Installers first (Windows, Flatpak, tarball), then the checksum list and its signature.
      .map((a) => ({ a, rank: KIND_ORDER[classifyStudioAsset(a.name, version)?.kind] ?? (a.name === 'SHA256SUMS' ? 3 : 4) }))
      .sort((x, y) => x.rank - y.rank || x.a.name.localeCompare(y.a.name))
      .map(({ a }) => a)
      .map((a) => ({
        file: a.name,
        url: a.browser_download_url,
        size: humanSize(a.size),
        sha256: typeof a.digest === 'string' && /^sha256:[0-9a-f]{64}$/.test(a.digest) ? a.digest.slice(7) : null,
      }));
    return {
      tag: r.tag_name,
      version,
      prerelease: Boolean(r.prerelease) || version.includes('-'),
      published: day(r),
      notesUrl: r.html_url,
      files,
    };
  });
}

/**
 * A Maven library: its newest `v<version>` GitHub Release. Each library's
 * release.yml runs `mvn deploy` first and creates that release only after the
 * deploy succeeded, so the release is the evidence the coordinate exists. The
 * registry itself (maven.pkg.github.com) cannot be read without a token holding
 * read:packages, which this build deliberately does not have.
 */
export async function fetchPackage(src, releasesOf) {
  const base = {
    id: src.id,
    label: src.label,
    groupId: src.groupId,
    artifactId: src.artifactId,
    packaging: src.packaging,
    repo: src.repo,
  };
  const [newest] = releasesWithPrefix(await releasesOf(src.repo), src.tagPrefix);
  if (!newest) return { ...base, version: null, prerelease: false, published: null, notesUrl: null };
  return {
    ...base,
    version: newest.version,
    prerelease: Boolean(newest.r.prerelease) || newest.version.includes('-'),
    published: day(newest.r),
    notesUrl: newest.r.html_url,
  };
}

/** Every repository the page lists something from, with its newest non-draft release. */
export async function fetchRepos(sources, releasesOf) {
  const provides = new Map();
  const add = (repo, what) => {
    if (!provides.has(repo)) provides.set(repo, new Set());
    provides.get(repo).add(what);
  };
  add(sources.studio.repo, 'studio');
  for (const i of sources.images) add(i.repo, 'image');
  for (const p of sources.packages ?? []) add(p.repo, 'package');
  const order = ['studio', 'image', 'package'];
  const out = [];
  for (const repo of [...provides.keys()].sort()) {
    // A release the page could not date or link is not one it can show.
    const visible = (await releasesOf(repo)).filter(
      (r) =>
        !r.draft &&
        typeof r.tag_name === 'string' &&
        /^\d{4}-\d{2}-\d{2}$/.test(day(r)) &&
        typeof r.html_url === 'string' &&
        r.html_url.startsWith('https://'),
    );
    visible.sort((a, b) => day(b).localeCompare(day(a)));
    const r = visible[0];
    out.push({
      repo,
      provides: order.filter((o) => provides.get(repo).has(o)),
      latest: r ? { tag: r.tag_name, prerelease: Boolean(r.prerelease), published: day(r), url: r.html_url } : null,
    });
  }
  return out;
}

/** The whole file. `now` is injectable so a fixture run is reproducible. */
export async function buildReleaseData({ sources, client, now = new Date() }) {
  const releasesOf = releaseCache(client);
  const studio = await fetchStudio(client, sources.studio, releasesOf);
  const studioArchive = await fetchStudioArchive(sources.studio, releasesOf);
  const images = [];
  // One at a time: 39 images, a handful of small requests each. Gentle on the
  // anonymous registry limits, and an error names the image it came from.
  for (const src of sources.images) {
    try {
      images.push(await fetchImage(client, src));
    } catch (e) {
      throw new FetchFailure(`${src.image}: ${e?.message ?? e}`);
    }
  }
  const packages = [];
  for (const src of sources.packages ?? []) {
    try {
      packages.push(await fetchPackage(src, releasesOf));
    } catch (e) {
      throw new FetchFailure(`${src.groupId}:${src.artifactId}: ${e?.message ?? e}`);
    }
  }
  return {
    schema: RELEASE_DATA_SCHEMA,
    generated: now.toISOString(),
    studioRepo: sources.studio.repo,
    studio,
    studioArchive,
    images,
    packages,
    repos: await fetchRepos(sources, releasesOf),
  };
}

async function main(argv) {
  const arg = (name, fallback) => {
    const i = argv.indexOf(`--${name}`);
    return i === -1 ? fallback : argv[i + 1];
  };
  const out = path.resolve(ROOT, arg('out', 'src/assets/releases.json'));
  const sources = JSON.parse(await readFile(path.resolve(ROOT, arg('sources', 'release-sources.json')), 'utf8'));
  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || undefined;
  const client = makeClient({ token, log: (m) => console.warn(`fetch-releases: ${m}`) });

  const data = await buildReleaseData({ sources, client });
  const errors = validateReleaseData(data);
  if (errors.length) {
    console.error('fetch-releases: the generated data does not match the schema the page reads:');
    for (const e of errors) console.error(`  - ${e}`);
    process.exit(1);
  }
  await mkdir(path.dirname(out), { recursive: true });
  await writeFile(out, JSON.stringify(data, null, 2) + '\n');

  const published = data.images.filter((i) => i.version);
  console.log(
    `fetch-releases: Studio ${data.studio ? `${data.studio.version} (${data.studio.installers.length} installers, ${data.studioArchive.length} older)` : 'not published'}; ` +
      `images ${published.length}/${data.images.length} published; ` +
      `packages ${data.packages.filter((p) => p.version).length}/${data.packages.length} released; ` +
      `repos ${data.repos.filter((r) => r.latest).length}/${data.repos.length} with a release -> ${path.relative(ROOT, out)}`,
  );
  for (const i of published) {
    console.log(`  ${i.image}:${i.version} ${i.digest} signed=${i.signed} attested=${i.attested}`);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main(process.argv.slice(2)).catch((e) => {
    console.error(`fetch-releases: FAILED: ${e?.message ?? e}`);
    process.exit(1);
  });
}
