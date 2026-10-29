/**
 * The shape of `assets/releases.json`, and the one validator for it.
 *
 * WHO WRITES IT. Nobody by hand. `scripts/fetch-releases.mjs` builds it during
 * the Pages build from the GitHub Releases API (Studio) and the GHCR registry
 * (images), then validates it with `validateReleaseData` below and refuses to
 * write a file that fails. The Downloads page validates it again when it loads
 * it, so a file that slipped past is shown as "could not be read" instead of a
 * half-rendered page with empty links.
 *
 * WHY ONE FILE FOR BOTH. The generator is Node and the page is Angular. If each
 * had its own idea of the shape, the build could write a file the page cannot
 * read and every test would still pass. Node runs this file directly (type
 * stripping), so it must stay free of imports and of syntax that is not
 * erasable: no enums, no namespaces, no parameter properties.
 *
 * VERSIONS ARE DATA. Nothing here, and nothing in the page, names a version
 * number. They come from the release that was actually published.
 */

export const RELEASE_DATA_SCHEMA = 3;

/** GitHub's OIDC issuer: what a keyless signature made in Actions carries. */
export const ACTIONS_OIDC_ISSUER = 'https://token.actions.githubusercontent.com';

export type InstallerKind = 'msi' | 'flatpak' | 'tarball';
export type InstallerPlatform = 'windows' | 'linux';
export type ImageGroup = 'node' | 'gateway' | 'service' | 'ui' | 'games';

/** Who must have signed something for a verification to pass. */
export interface SigningIdentity {
  /** Regular expression over the signing workflow's identity (its file and ref). */
  readonly regexp: string;
  readonly issuer: string;
}

export interface ReleaseFile {
  readonly file: string;
  /** Absolute download URL, so the page works on any host that serves it. */
  readonly url: string;
}

/** One published Studio installer. */
export interface Installer extends ReleaseFile {
  readonly platform: InstallerPlatform;
  readonly kind: InstallerKind;
  readonly label: string;
  /** Human size, e.g. "43.9 MB". */
  readonly size: string;
  readonly bytes: number;
  /** Lower-case hex, from the release's SHA256SUMS (or GitHub's asset digest). */
  readonly sha256: string | null;
  /** True when GitHub holds a build-provenance attestation for this digest. */
  readonly attested: boolean;
  /** SPDX software bill of materials for this file, when the release has one. */
  readonly sbom: ReleaseFile | null;
}

export interface StudioRelease {
  readonly repo: string;
  readonly tag: string;
  readonly version: string;
  readonly prerelease: boolean;
  /** YYYY-MM-DD */
  readonly published: string;
  readonly notesUrl: string;
  readonly installers: readonly Installer[];
  /** The SHA256SUMS file, if the release carries one. */
  readonly checksums: ReleaseFile | null;
  /** The Sigstore bundle that signs SHA256SUMS, if the release carries one. */
  readonly checksumsSignature: ReleaseFile | null;
  readonly identity: SigningIdentity;
  /** True only when the release says its MSI is Authenticode-signed. */
  readonly authenticode: boolean;
}

export interface ImageEntry {
  readonly id: string;
  readonly label: string;
  readonly group: ImageGroup;
  /** owner/name of the repository that builds it. */
  readonly repo: string;
  /** Registry reference without a tag, e.g. ghcr.io/hugmesh/hugmesh-admin-ui */
  readonly image: string;
  /** Newest published version tag, or null when nothing is published (or visible). */
  readonly version: string | null;
  readonly prerelease: boolean;
  /** sha256:<hex> of that tag's manifest, or null. */
  readonly digest: string | null;
  /** A cosign signature was found for that digest. */
  readonly signed: boolean;
  /** GitHub holds a build-provenance attestation for that digest. */
  readonly attested: boolean;
  readonly identity: SigningIdentity;
  /** The GitHub release for that version, if one exists. */
  readonly notesUrl: string | null;
}

/** One file of an older Studio release: enough to download and check it, no more. */
export interface ArchivedFile extends ReleaseFile {
  readonly size: string;
  /** GitHub's own SHA-256 of the asset, when the API reports one. */
  readonly sha256: string | null;
}

/** A Studio release that is not the newest. Listed so nothing published is unreachable. */
export interface StudioArchiveEntry {
  readonly tag: string;
  readonly version: string;
  readonly prerelease: boolean;
  /** YYYY-MM-DD */
  readonly published: string;
  readonly notesUrl: string;
  readonly files: readonly ArchivedFile[];
}

/**
 * A Maven library published to GitHub Packages. Its version is the newest
 * `v<version>` GitHub Release of its repository: each library's release
 * workflow creates that release only AFTER `mvn deploy` succeeded, so a release
 * means the coordinate is in the registry. (The registry itself cannot be read
 * without a token that has read:packages, which the site build does not hold.)
 */
export interface PackageEntry {
  readonly id: string;
  readonly label: string;
  readonly groupId: string;
  readonly artifactId: string;
  /** "pom" for a parent POM (used as <parent>), "jar" for a library. */
  readonly packaging: 'jar' | 'pom';
  readonly repo: string;
  readonly version: string | null;
  readonly prerelease: boolean;
  /** YYYY-MM-DD of the GitHub release, or null. */
  readonly published: string | null;
  readonly notesUrl: string | null;
}

/** Every repository that releases something, with its newest GitHub release. */
export interface RepoEntry {
  readonly repo: string;
  /** What the Downloads page lists from it. */
  readonly provides: readonly ('studio' | 'image' | 'package')[];
  readonly latest: {
    readonly tag: string;
    readonly prerelease: boolean;
    /** YYYY-MM-DD */
    readonly published: string;
    readonly url: string;
  } | null;
}

export interface ReleaseData {
  readonly schema: number;
  /** ISO 8601 time the data was generated. */
  readonly generated: string;
  /** Where the Studio is released, even when nothing is yet. */
  readonly studioRepo: string;
  readonly studio: StudioRelease | null;
  /** Every OTHER published Studio release, newest first. */
  readonly studioArchive: readonly StudioArchiveEntry[];
  readonly images: readonly ImageEntry[];
  readonly packages: readonly PackageEntry[];
  readonly repos: readonly RepoEntry[];
}

// ── validation ───────────────────────────────────────────────────────────────

const SEMVER =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?$/;
const HEX64 = /^[0-9a-f]{64}$/;
const DIGEST = /^sha256:[0-9a-f]{64}$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const REPO = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const IMAGE = /^ghcr\.io\/[a-z0-9_.-]+(?:\/[a-z0-9_.-]+)+$/;

type Obj = Record<string, unknown>;

function isObj(v: unknown): v is Obj {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Absolute https URL only: a relative one breaks on whichever host is not the build's. */
function isAbsoluteHttps(v: unknown): boolean {
  if (typeof v !== 'string') return false;
  try {
    return new URL(v).protocol === 'https:';
  } catch {
    return false;
  }
}

export function isSemver(v: unknown): v is string {
  return typeof v === 'string' && SEMVER.test(v);
}

function str(o: Obj, key: string, where: string, errors: string[], nonEmpty = true): void {
  const v = o[key];
  if (typeof v !== 'string' || (nonEmpty && v.trim() === '')) {
    errors.push(`${where}.${key} must be a ${nonEmpty ? 'non-empty ' : ''}string`);
  }
}

function bool(o: Obj, key: string, where: string, errors: string[]): void {
  if (typeof o[key] !== 'boolean') errors.push(`${where}.${key} must be true or false`);
}

function url(o: Obj, key: string, where: string, errors: string[]): void {
  if (!isAbsoluteHttps(o[key])) errors.push(`${where}.${key} must be an absolute https URL`);
}

function identity(v: unknown, where: string, errors: string[]): void {
  if (!isObj(v)) {
    errors.push(`${where} must be an object`);
    return;
  }
  str(v, 'regexp', where, errors);
  if (v['issuer'] !== ACTIONS_OIDC_ISSUER) {
    errors.push(`${where}.issuer must be ${ACTIONS_OIDC_ISSUER}`);
  }
  if (typeof v['regexp'] === 'string') {
    try {
      new RegExp(v['regexp']);
    } catch {
      errors.push(`${where}.regexp is not a valid regular expression`);
    }
  }
}

function releaseFile(v: unknown, where: string, errors: string[], nullable: boolean): void {
  if (v === null && nullable) return;
  if (!isObj(v)) {
    errors.push(`${where} must be an object${nullable ? ' or null' : ''}`);
    return;
  }
  str(v, 'file', where, errors);
  url(v, 'url', where, errors);
}

function installer(v: unknown, where: string, errors: string[]): void {
  if (!isObj(v)) {
    errors.push(`${where} must be an object`);
    return;
  }
  releaseFile(v, where, errors, false);
  if (v['platform'] !== 'windows' && v['platform'] !== 'linux') {
    errors.push(`${where}.platform must be "windows" or "linux"`);
  }
  if (v['kind'] !== 'msi' && v['kind'] !== 'flatpak' && v['kind'] !== 'tarball') {
    errors.push(`${where}.kind must be "msi", "flatpak" or "tarball"`);
  }
  str(v, 'label', where, errors);
  str(v, 'size', where, errors);
  if (typeof v['bytes'] !== 'number' || !Number.isInteger(v['bytes']) || v['bytes'] <= 0) {
    errors.push(`${where}.bytes must be a positive whole number`);
  }
  if (v['sha256'] !== null && !(typeof v['sha256'] === 'string' && HEX64.test(v['sha256']))) {
    errors.push(`${where}.sha256 must be 64 lower-case hex characters or null`);
  }
  bool(v, 'attested', where, errors);
  releaseFile(v['sbom'], `${where}.sbom`, errors, true);
}

function studio(v: unknown, errors: string[]): void {
  const where = 'studio';
  if (v === null) return;
  if (!isObj(v)) {
    errors.push('studio must be an object or null');
    return;
  }
  if (typeof v['repo'] !== 'string' || !REPO.test(v['repo'])) errors.push('studio.repo must be owner/name');
  str(v, 'tag', where, errors);
  if (!isSemver(v['version'])) errors.push('studio.version must be a SemVer version');
  if (typeof v['tag'] === 'string' && typeof v['version'] === 'string' && !v['tag'].endsWith(v['version'])) {
    errors.push('studio.tag must end with studio.version');
  }
  bool(v, 'prerelease', where, errors);
  if (typeof v['published'] !== 'string' || !DAY.test(v['published'])) {
    errors.push('studio.published must be YYYY-MM-DD');
  }
  url(v, 'notesUrl', where, errors);
  if (!Array.isArray(v['installers'])) {
    errors.push('studio.installers must be a list');
  } else {
    v['installers'].forEach((it, i) => installer(it, `studio.installers[${i}]`, errors));
  }
  releaseFile(v['checksums'], 'studio.checksums', errors, true);
  releaseFile(v['checksumsSignature'], 'studio.checksumsSignature', errors, true);
  identity(v['identity'], 'studio.identity', errors);
  bool(v, 'authenticode', where, errors);
}

function image(v: unknown, where: string, errors: string[]): void {
  if (!isObj(v)) {
    errors.push(`${where} must be an object`);
    return;
  }
  str(v, 'id', where, errors);
  str(v, 'label', where, errors);
  const groups: readonly unknown[] = ['node', 'gateway', 'service', 'ui', 'games'];
  if (!groups.includes(v['group'])) errors.push(`${where}.group is not a known group`);
  if (typeof v['repo'] !== 'string' || !REPO.test(v['repo'])) errors.push(`${where}.repo must be owner/name`);
  if (typeof v['image'] !== 'string' || !IMAGE.test(v['image'])) {
    errors.push(`${where}.image must be a ghcr.io reference without a tag`);
  }
  const version = v['version'];
  if (version !== null && !isSemver(version)) errors.push(`${where}.version must be SemVer or null`);
  bool(v, 'prerelease', where, errors);
  const digest = v['digest'];
  if (digest !== null && !(typeof digest === 'string' && DIGEST.test(digest))) {
    errors.push(`${where}.digest must be sha256:<64 hex> or null`);
  }
  if (version === null && digest !== null) errors.push(`${where} has a digest but no version`);
  if (version !== null && digest === null) errors.push(`${where} has a version but no digest`);
  bool(v, 'signed', where, errors);
  bool(v, 'attested', where, errors);
  identity(v['identity'], `${where}.identity`, errors);
  if (v['notesUrl'] !== null && !isAbsoluteHttps(v['notesUrl'])) {
    errors.push(`${where}.notesUrl must be an absolute https URL or null`);
  }
}

function archiveEntry(v: unknown, where: string, errors: string[]): void {
  if (!isObj(v)) {
    errors.push(`${where} must be an object`);
    return;
  }
  str(v, 'tag', where, errors);
  if (!isSemver(v['version'])) errors.push(`${where}.version must be a SemVer version`);
  bool(v, 'prerelease', where, errors);
  if (typeof v['published'] !== 'string' || !DAY.test(v['published'])) errors.push(`${where}.published must be YYYY-MM-DD`);
  url(v, 'notesUrl', where, errors);
  if (!Array.isArray(v['files'])) {
    errors.push(`${where}.files must be a list`);
    return;
  }
  v['files'].forEach((f, i) => {
    const w = `${where}.files[${i}]`;
    releaseFile(f, w, errors, false);
    if (!isObj(f)) return;
    str(f, 'size', w, errors);
    if (f['sha256'] !== null && !(typeof f['sha256'] === 'string' && HEX64.test(f['sha256']))) {
      errors.push(`${w}.sha256 must be 64 lower-case hex characters or null`);
    }
  });
}

const MAVEN_ID = /^[A-Za-z0-9_.-]+$/;

function packageEntry(v: unknown, where: string, errors: string[]): void {
  if (!isObj(v)) {
    errors.push(`${where} must be an object`);
    return;
  }
  str(v, 'id', where, errors);
  str(v, 'label', where, errors);
  for (const k of ['groupId', 'artifactId']) {
    if (typeof v[k] !== 'string' || !MAVEN_ID.test(v[k] as string)) errors.push(`${where}.${k} must be a Maven identifier`);
  }
  if (v['packaging'] !== 'jar' && v['packaging'] !== 'pom') errors.push(`${where}.packaging must be "jar" or "pom"`);
  if (typeof v['repo'] !== 'string' || !REPO.test(v['repo'])) errors.push(`${where}.repo must be owner/name`);
  const version = v['version'];
  if (version !== null && !isSemver(version)) errors.push(`${where}.version must be SemVer or null`);
  bool(v, 'prerelease', where, errors);
  const pub = v['published'];
  if (pub !== null && !(typeof pub === 'string' && DAY.test(pub))) errors.push(`${where}.published must be YYYY-MM-DD or null`);
  if (v['notesUrl'] !== null && !isAbsoluteHttps(v['notesUrl'])) {
    errors.push(`${where}.notesUrl must be an absolute https URL or null`);
  }
  if (version === null && (pub !== null || v['notesUrl'] !== null)) errors.push(`${where} has release facts but no version`);
}

function repoEntry(v: unknown, where: string, errors: string[]): void {
  if (!isObj(v)) {
    errors.push(`${where} must be an object`);
    return;
  }
  if (typeof v['repo'] !== 'string' || !REPO.test(v['repo'])) errors.push(`${where}.repo must be owner/name`);
  const provides = v['provides'];
  if (!Array.isArray(provides) || provides.some((p) => p !== 'studio' && p !== 'image' && p !== 'package')) {
    errors.push(`${where}.provides must list "studio", "image" or "package"`);
  }
  const latest = v['latest'];
  if (latest === null) return;
  if (!isObj(latest)) {
    errors.push(`${where}.latest must be an object or null`);
    return;
  }
  str(latest, 'tag', `${where}.latest`, errors);
  bool(latest, 'prerelease', `${where}.latest`, errors);
  if (typeof latest['published'] !== 'string' || !DAY.test(latest['published'])) {
    errors.push(`${where}.latest.published must be YYYY-MM-DD`);
  }
  url(latest, 'url', `${where}.latest`, errors);
}

/** Validate a list field, reporting duplicates of `key`. */
function list(
  data: Obj,
  field: string,
  key: string,
  each: (v: unknown, where: string, errors: string[]) => void,
  errors: string[],
): void {
  const v = data[field];
  if (!Array.isArray(v)) {
    errors.push(`${field} must be a list`);
    return;
  }
  const seen = new Set<unknown>();
  v.forEach((it, i) => {
    each(it, `${field}[${i}]`, errors);
    if (isObj(it)) {
      if (seen.has(it[key])) errors.push(`${field}[${i}].${key} is listed twice`);
      seen.add(it[key]);
    }
  });
}

/**
 * Every way `data` fails to be a ReleaseData the page can render, as plain
 * sentences. An empty list means valid.
 */
export function validateReleaseData(data: unknown): string[] {
  const errors: string[] = [];
  if (!isObj(data)) return ['the file is not a JSON object'];
  if (data['schema'] !== RELEASE_DATA_SCHEMA) {
    errors.push(`schema must be ${RELEASE_DATA_SCHEMA}`);
  }
  if (typeof data['generated'] !== 'string' || Number.isNaN(Date.parse(data['generated']))) {
    errors.push('generated must be an ISO 8601 time');
  }
  if (typeof data['studioRepo'] !== 'string' || !REPO.test(data['studioRepo'])) {
    errors.push('studioRepo must be owner/name');
  }
  studio(data['studio'], errors);
  list(data, 'studioArchive', 'tag', archiveEntry, errors);
  list(data, 'images', 'image', image, errors);
  list(data, 'packages', 'id', packageEntry, errors);
  list(data, 'repos', 'repo', repoEntry, errors);
  return errors;
}

export function isReleaseData(data: unknown): data is ReleaseData {
  return validateReleaseData(data).length === 0;
}

// ── SemVer ordering (used by the generator to pick the newest release) ──────

/** Negative when a < b, positive when a > b, 0 when equal; SemVer 2.0 precedence. */
export function compareSemver(a: string, b: string): number {
  const pa = SEMVER.exec(a);
  const pb = SEMVER.exec(b);
  if (!pa || !pb) throw new Error(`not SemVer: ${!pa ? a : b}`);
  for (let i = 1; i <= 3; i++) {
    const d = Number(pa[i]) - Number(pb[i]);
    if (d !== 0) return d;
  }
  const preA = pa[4];
  const preB = pb[4];
  if (preA === undefined && preB === undefined) return 0;
  if (preA === undefined) return 1; // a final release outranks its prereleases
  if (preB === undefined) return -1;
  const xa = preA.split('.');
  const xb = preB.split('.');
  for (let i = 0; i < Math.max(xa.length, xb.length); i++) {
    const ia = xa[i];
    const ib = xb[i];
    if (ia === undefined) return -1;
    if (ib === undefined) return 1;
    const na = /^\d+$/.test(ia);
    const nb = /^\d+$/.test(ib);
    if (na && nb) {
      const d = Number(ia) - Number(ib);
      if (d !== 0) return d;
    } else if (na !== nb) {
      return na ? -1 : 1;
    } else if (ia !== ib) {
      return ia < ib ? -1 : 1;
    }
  }
  return 0;
}
