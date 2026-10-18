// Shared, pure import-specifier scanning for the corpus scripts: the selector
// (which candidates Blast can bundle) and the dependency scan (which npm
// packages extensions import) read the same rules here, so the two cannot
// drift. Nothing here reads files, runs git or touches the network.
import { isBuiltin } from "node:module";

/** One source file of an extension, as read from the pinned checkout. */
export type Source = { file: string; source: string };

/** Packages the bundler resolves for every extension; only subpaths vary. */
export const PROVIDED_PACKAGES = ["@raycast/api", "@raycast/utils", "react"] as const;

const escaped = PROVIDED_PACKAGES.map((name) => name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
/** A bare specifier naming a provided package, subpaths included. */
const PROVIDED_SPECIFIER = new RegExp(`^(?:${escaped.join("|")})(?:/|$)`);

export const IMPORT_SPECIFIER =
  /(?:from\s+|import\s*\(\s*|import\s+|require\s*\(\s*)["']([^"'\s]+)["']/g;
/** A command never bundles a test file, so a dev-only import there cannot fail it. */
export const TEST_FILE = /(?:^|[\\/])(?:__tests__|__mocks__)[\\/]|\.(?:test|spec)\.[cm]?[jt]sx?$/;

/** Bare module specifiers in `sources` that Blast cannot resolve when bundling. */
export function unprovidedImports(sources: Iterable<Source>): string[] {
  const found = new Set<string>();
  for (const { file, source } of sources) {
    if (TEST_FILE.test(file)) continue;
    for (const match of source.matchAll(IMPORT_SPECIFIER)) {
      const specifier = match[1]!;
      if (specifier.startsWith(".") || specifier.startsWith("/")) continue;
      if (PROVIDED_SPECIFIER.test(specifier) || isBuiltin(specifier)) continue;
      found.add(specifier);
    }
  }
  return [...found].toSorted();
}

/** The npm package a bare specifier names: the scope for `@scope/name`. */
export function packageName(specifier: string): string {
  const segments = specifier.split("/");
  return specifier.startsWith("@") ? segments.slice(0, 2).join("/") : segments[0]!;
}

/**
 * npm packages imported by non-test sources. `unprovidedImports` keeps
 * specifiers because the bundler reports those; this keeps packages because
 * the dependency report sums a package's whole import surface. Relative paths,
 * the provided packages and non-npm specifiers (`node:`, `swift:` and other
 * URL-like schemes) are never packages Blast could pin.
 */
export function importedPackages(sources: Iterable<Source>): string[] {
  const found = new Set<string>();
  for (const { file, source } of sources) {
    if (TEST_FILE.test(file)) continue;
    for (const match of source.matchAll(IMPORT_SPECIFIER)) {
      const specifier = match[1]!;
      if (specifier.startsWith(".") || specifier.startsWith("/")) continue;
      if (specifier.includes(":") || PROVIDED_SPECIFIER.test(specifier)) continue;
      if (isBuiltin(specifier)) continue;
      found.add(packageName(specifier));
    }
  }
  return [...found].toSorted();
}
