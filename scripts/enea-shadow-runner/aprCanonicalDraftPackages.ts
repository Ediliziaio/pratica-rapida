import { createHash } from "node:crypto";
import { closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { AprEneaDraftPackage } from "./aprEneaBrowserWorker";

export const APR_CANONICAL_DRAFT_PACKAGES_VERSION = "apr-canonical-draft-packages-v1" as const;

interface CanonicalPackageEntry {
  customerKey: string;
  practiceId: string;
  packageFingerprint: string;
  artifactPath: string;
  artifactSha256: string;
}

interface CanonicalPackageManifest {
  version: typeof APR_CANONICAL_DRAFT_PACKAGES_VERSION;
  sourceFingerprint: string;
  frozenAt: string;
  packages: CanonicalPackageEntry[];
}

const sha256 = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
const validHash = (value: unknown): value is string => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);

function atomicWrite(target: string, contents: string) {
  mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 });
  const temporary = `${target}.tmp-${process.pid}-${crypto.randomUUID()}`;
  const descriptor = openSync(temporary, "wx", 0o600);
  try { writeFileSync(descriptor, contents, "utf8"); fsyncSync(descriptor); } finally { closeSync(descriptor); }
  renameSync(temporary, target);
  const directory = openSync(path.dirname(target), "r");
  try { fsyncSync(directory); } finally { closeSync(directory); }
}

function validatePackage(value: unknown): asserts value is AprEneaDraftPackage {
  const item = value as Partial<AprEneaDraftPackage> | null;
  if (!item || typeof item !== "object"
    || typeof item.customerKey !== "string" || !item.customerKey.trim()
    || typeof item.practiceId !== "string" || !item.practiceId.trim()
    || !validHash(item.packageFingerprint)
    || !validHash(item.workflowFingerprint)
    || item.safety?.previewAllowed !== false
    || item.safety?.submitAllowed !== false
    || item.safety?.communicationsAllowed !== false) throw new Error("apr_canonical_draft_package_invalid");
}

/**
 * Congela il pacchetto eseguibile una sola volta. Preflight, bridge e worker
 * condividono poi gli stessi byte: il worker non richiama mai i costruttori.
 */
export class PersistentAprCanonicalDraftPackages {
  readonly directory: string;
  readonly packagesDirectory: string;
  readonly manifestsDirectory: string;

  constructor(rootDirectory: string) {
    this.directory = path.join(path.resolve(rootDirectory), "canonical-draft-packages");
    this.packagesDirectory = path.join(this.directory, "packages");
    this.manifestsDirectory = path.join(this.directory, "manifests");
  }

  manifestPath(sourceFingerprint: string) {
    if (!validHash(sourceFingerprint)) throw new Error("apr_canonical_package_source_fingerprint_invalid");
    return path.join(this.manifestsDirectory, `${sourceFingerprint}.json`);
  }

  private readManifest(sourceFingerprint: string): CanonicalPackageManifest | null {
    const manifestPath = this.manifestPath(sourceFingerprint);
    if (!existsSync(manifestPath)) return null;
    const value = JSON.parse(readFileSync(manifestPath, "utf8")) as CanonicalPackageManifest;
    if (value.version !== APR_CANONICAL_DRAFT_PACKAGES_VERSION
      || value.sourceFingerprint !== sourceFingerprint
      || !Array.isArray(value.packages)
      || new Set(value.packages.map((item) => item.customerKey)).size !== value.packages.length
      || value.packages.some((item) => !item.customerKey.trim() || !item.practiceId.trim()
        || !validHash(item.packageFingerprint) || !validHash(item.artifactSha256))) {
      throw new Error("apr_canonical_package_manifest_invalid");
    }
    return value;
  }

  loadManifestPackages(sourceFingerprint: string) {
    const manifest = this.readManifest(sourceFingerprint);
    if (!manifest) return null;
    return manifest.packages.map((entry) => this.load(entry.customerKey, entry.packageFingerprint, entry.artifactSha256));
  }

  freeze(sourceFingerprint: string, packages: readonly AprEneaDraftPackage[], now = new Date()) {
    if (!validHash(sourceFingerprint)
      || new Set(packages.map((item) => item.customerKey)).size !== packages.length) {
      throw new Error("apr_canonical_package_freeze_input_invalid");
    }
    const existing = this.loadManifestPackages(sourceFingerprint);
    if (existing) return existing;
    const entries = packages.map((candidate) => {
      const draftPackage = candidate;
      validatePackage(draftPackage);
      const contents = `${JSON.stringify(draftPackage, null, 2)}\n`;
      const artifactSha256 = sha256(contents);
      const artifactPath = path.join(this.packagesDirectory, `${draftPackage.packageFingerprint}.json`);
      if (existsSync(artifactPath)) {
        if (sha256(readFileSync(artifactPath)) !== artifactSha256) throw new Error("apr_canonical_package_artifact_collision");
      } else atomicWrite(artifactPath, contents);
      return { customerKey: draftPackage.customerKey, practiceId: draftPackage.practiceId, packageFingerprint: draftPackage.packageFingerprint, artifactPath, artifactSha256 };
    }).sort((left, right) => left.customerKey.localeCompare(right.customerKey));
    const manifest: CanonicalPackageManifest = { version: APR_CANONICAL_DRAFT_PACKAGES_VERSION, sourceFingerprint, frozenAt: now.toISOString(), packages: entries };
    atomicWrite(this.manifestPath(sourceFingerprint), `${JSON.stringify(manifest, null, 2)}\n`);
    return this.loadManifestPackages(sourceFingerprint)!;
  }

  load(customerKey: string, packageFingerprint: string, expectedArtifactSha256?: string) {
    if (!customerKey.trim() || !validHash(packageFingerprint)) throw new Error("apr_canonical_package_lookup_invalid");
    const artifactPath = path.join(this.packagesDirectory, `${packageFingerprint}.json`);
    if (!existsSync(artifactPath)) throw new Error("apr_canonical_package_artifact_missing");
    const contents = readFileSync(artifactPath);
    const artifactSha256 = sha256(contents);
    if (expectedArtifactSha256 && artifactSha256 !== expectedArtifactSha256) throw new Error("apr_canonical_package_artifact_hash_mismatch");
    const draftPackage = JSON.parse(contents.toString("utf8")) as AprEneaDraftPackage;
    validatePackage(draftPackage);
    if (draftPackage.customerKey !== customerKey || draftPackage.packageFingerprint !== packageFingerprint) throw new Error("apr_canonical_package_artifact_identity_mismatch");
    return draftPackage;
  }
}
