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

/** Warn only when no version in the supplied major can satisfy the declaration. */
export function dependencyWarnings(declarations: Record<string, unknown> = {}): string[] {
  const pinned: Record<string, string> = manifest.dependencies;
  return PROVIDED_PACKAGES.flatMap((name) => {
    const version = pinned[name];
    const range = declarations[name];
    if (!version || typeof range !== "string" || !validRange(range)) return [];
    const major = version.split(".")[0];
    if (intersects(range, `${major}.x`, { includePrerelease: true })) return [];
    return [`Shared dependency ${name}: declared ${range}, provided ${version} (major mismatch)`];
  });
}
