// Shared, pure import-specifier scanning for the corpus scripts: the selector
// (which candidates Blast can bundle) and the dependency scan (which npm
// packages extensions import) read the same rules here, so the two cannot
// drift. Nothing here reads files, runs git or touches the network.
import { isBuiltin } from "node:module";
import { isProvidedSpecifier, PROVIDED_PACKAGES } from "../../packages/host/src/dependencies.ts";
export { PROVIDED_PACKAGES };

// Stable baseline keeps the usage ranking comparable as the shared set grows.
export const BASE_PACKAGES = ["@raycast/api", "@raycast/utils", "react"] as const;

/** `PROVIDED_PACKAGES` minus the baseline every extension already needs: the
 * packages task 0037 added to the shared allowlist specifically (node-fetch,
 * axios, date-fns, …), in declaration order. */
export const SHARED_DEPENDENCY_PACKAGES: string[] = PROVIDED_PACKAGES.filter(
  (name): boolean => !(BASE_PACKAGES as readonly string[]).includes(name),
);

/** One source file of an extension, as read from the pinned checkout. */
export type Source = { file: string; source: string };

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
      if (isProvidedSpecifier(specifier) || isBuiltin(specifier)) continue;
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
 * A name npm would accept: lowercase, optionally scoped. Import scanning is
 * syntactic, so it also reads text that merely looks like an import — a
 * generated Swift script (`from "AppKit"`) or a Node subpath import
 * (`#imports`) — and those are not packages Blast could pin. A scope-shaped
 * tsconfig alias (`@lib/utils`) is indistinguishable from a package here and
 * stays, exactly as `unprovidedImports` counts it for bundling.
 */
const NPM_PACKAGE = /^(?:@[a-z0-9][a-z0-9-._~]*\/)?[a-z0-9][a-z0-9-._~]*$/;

/**
 * npm packages imported by non-test sources. `unprovidedImports` keeps
 * specifiers because the bundler reports those; this keeps packages because
 * the dependency report sums a package's whole import surface. Relative paths,
 * the baseline packages, non-npm specifiers (`node:`, `swift:`) and names npm
 * would not accept are left out.
 */
export function importedPackages(sources: Iterable<Source>): string[] {
  const found = new Set<string>();
  for (const { file, source } of sources) {
    if (TEST_FILE.test(file)) continue;
    for (const match of source.matchAll(IMPORT_SPECIFIER)) {
      const specifier = match[1]!;
      if (specifier.startsWith(".") || specifier.startsWith("/")) continue;
      if (specifier.includes(":")) continue;
      if (BASE_PACKAGES.some((name) => specifier === name || specifier.startsWith(`${name}/`)))
        continue;
      if (isBuiltin(specifier)) continue;
      const name = packageName(specifier);
      if (NPM_PACKAGE.test(name)) found.add(name);
    }
  }
  return [...found].toSorted();
}
