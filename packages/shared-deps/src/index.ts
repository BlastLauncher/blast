import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { isAbsolute, join } from "node:path";
import { Range, parse, validRange, type Comparator, type SemVer } from "semver";
import manifest from "../package.json" with { type: "json" };

// Interim, ranked by corpus imports. No native addons, install hooks or binaries.
// Size and platform exclusions are recorded in decision 0002.
export const PROVIDED_PACKAGES = [
  "@raycast/api",
  "react",
  "@raycast/utils",
  "node-fetch",
  "axios",
  "date-fns",
  "lodash",
  "zod",
  "cheerio",
  "dayjs",
  "fuse.js",
  "uuid",
  "nanoid",
  "cross-fetch",
  "moment",
  "node-html-markdown",
] as const;

export function isProvidedSpecifier(specifier: string): boolean {
  return PROVIDED_PACKAGES.some((name) => specifier === name || specifier.startsWith(`${name}/`));
}

type NormalizedRange = { range: string; wildcard: boolean };

/** Resolve the semver part of a dependency declaration, if it has one. */
function normalizedRange(name: string, value: unknown): NormalizedRange | undefined {
  if (typeof value !== "string") return undefined;
  const raw = value.trim();
  if (raw === "latest" || raw === "*") return { range: "*", wildcard: true };
  if (raw.startsWith("npm:")) {
    const alias = /^npm:(@[^/]+\/[^@]+|[^@]+)(?:@(.+))?$/.exec(raw);
    if (!alias || alias[1] !== name) return undefined;
    const inner = alias[2]?.trim() || "*";
    return validRange(inner) ? { range: inner, wildcard: inner === "*" } : undefined;
  }
  return validRange(raw) ? { range: raw, wildcard: false } : undefined;
}

function stableVersionCandidates(version: SemVer, set: readonly Comparator[]): string[] {
  const candidates = new Set<string>([`${version.major}.0.0`, version.version]);
  for (const comparator of set) {
    const value = comparator.semver;
    if (!value || value.major !== version.major) continue;
    const { minor, patch } = value;
    candidates.add(`${value.major}.${minor}.${patch}`);
    candidates.add(`${value.major}.${minor}.${patch + 1}`);
    candidates.add(`${value.major}.${minor + 1}.0`);
    if (patch > 0) candidates.add(`${value.major}.${minor}.${patch - 1}`);
    if (minor > 0) candidates.add(`${value.major}.${minor - 1}.0`);
  }
  return [...candidates];
}

/** Whether one comparator set admits a stable version on the provided line. */
function admitsStableVersion(version: SemVer, set: readonly Comparator[]): boolean {
  const line = version.major === 0 ? `${version.major}.${version.minor}` : `${version.major}`;
  const hasStableComparator = set.some(
    (comparator) => comparator.value === "" || comparator.semver?.prerelease.length === 0,
  );
  if (!hasStableComparator) return false;
  return stableVersionCandidates(version, set).some((candidate) => {
    const parsed = parse(candidate);
    return (
      parsed !== null &&
      (version.major === 0
        ? `${parsed.major}.${parsed.minor}` === line
        : parsed.major === version.major) &&
      parsed.prerelease.length === 0 &&
      set.every((comparator) => comparator.test(parsed))
    );
  });
}

/** Whether a declared range admits a stable release of the provided line. */
export function isDependencyCompatible(name: string, range: unknown): boolean {
  const pinned = (manifest.dependencies as Record<string, string>)[name];
  if (!pinned) return true;
  const version = parse(pinned);
  const normalized = normalizedRange(name, range);
  if (!version || !normalized) return false;
  if (normalized.wildcard) return true;
  let parsed: Range;
  try {
    parsed = new Range(normalized.range);
  } catch {
    return false;
  }
  return parsed.set.some((set) => admitsStableVersion(version, set));
}

/** Warn only when no version in the supplied major can satisfy the declaration. */
export function dependencyWarnings(declarations: Record<string, unknown> = {}): string[] {
  const pinned: Record<string, string> = manifest.dependencies;
  return PROVIDED_PACKAGES.flatMap((name) => {
    const version = pinned[name];
    const range = declarations[name];
    if (!version || !normalizedRange(name, range)) return [];
    if (isDependencyCompatible(name, range)) return [];
    return [`Shared dependency ${name}: declared ${range}, provided ${version} (major mismatch)`];
  });
}

const requireShared = createRequire(import.meta.url);

/** Resolve from this package, never from the extension or engine install. */
export function resolveShared(
  specifier: string,
  kind: "import" | "require" = "import",
): string | undefined {
  if (
    !isProvidedSpecifier(specifier) ||
    specifier === "@raycast/api" ||
    /^react(?:\/|$)/.test(specifier)
  )
    return undefined;
  const resolved =
    kind === "require" ? requireShared.resolve(specifier) : import.meta.resolve(specifier);
  if (resolved.startsWith("file:")) return fileURLToPath(resolved);
  if (isAbsolute(resolved)) return resolved;
  // Bun aliases npm names (e.g. node-fetch) to built-ins. Absolute lookup
  // bypasses those aliases while retaining this package's search paths.
  for (const directory of requireShared.resolve.paths(`${specifier}/package.json`) ?? []) {
    try {
      return requireShared.resolve(join(directory, specifier));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "MODULE_NOT_FOUND") throw error;
    }
  }
  throw new Error(`Cannot resolve shared dependency ${specifier}`);
}
