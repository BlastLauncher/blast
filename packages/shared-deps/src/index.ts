import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { isAbsolute, join } from "node:path";
import { intersects, validRange } from "semver";
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

/** Whether a declared range admits a stable release of the provided major. */
export function isDependencyCompatible(name: string, range: unknown): boolean {
  const version = manifest.dependencies[name];
  if (!version || typeof range !== "string" || !validRange(range)) return true;
  const major = version.split(".")[0]!;
  // A prerelease declaration such as ^1.0.0-rc.12 is intentionally pinned
  // to the prerelease line by the extension, even though semver's caret range
  // can also mathematically include later stable releases.
  if (new RegExp(`\\b${major}\\.\\d+\\.\\d+-[0-9A-Za-z.-]+`).test(range)) {
    const hasStableComparator = new RegExp(`\\b${major}\\.\\d+\\.\\d+(?!-)`).test(range);
    if (!hasStableComparator) return false;
  }
  return intersects(range, `${major}.x`);
}

/** Warn only when no version in the supplied major can satisfy the declaration. */
export function dependencyWarnings(declarations: Record<string, unknown> = {}): string[] {
  const pinned: Record<string, string> = manifest.dependencies;
  return PROVIDED_PACKAGES.flatMap((name) => {
    const version = pinned[name];
    const range = declarations[name];
    if (!version || typeof range !== "string" || !validRange(range)) return [];
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
