# 0002 — Extension dependency resolution

Status: accepted 2026-10-18; amended by task 0037 (interim allowlist)

## Decision

Until v1, extensions run without installing their dependencies. The host's
esbuild plugin resolves imports in this order:

1. `@raycast/api`, `react`, and `react/*` stay external; the runtime supplies them.
2. Packages in `packages/host/src/dependencies.ts` resolve from the host's exact
   pins, including subpaths. Their transitive graphs are bundled; the API/React
   external rules apply throughout. Corpus selection uses the same list.
3. Node built-ins stay external.
4. Other bare imports fail, even if installed locally. Relative source imports work.

The allowlist selects 20 packages from the top 30 by corpus imports, pinning the
latest version of each most-declared major. All are JavaScript, with no native
addons, install hooks or bundled browser/CLI binaries. Exclusions:

- `run-applescript`: macOS automation; `raycast-cross-extension`: Raycast-specific
  cross-extension integration, outside the portable shared-dependency policy.
- `date-fns`, `openai`, `turndown`, `chrono-node`, `plist`, `algoliasearch`:
  their installed graphs exhaust the 60 MB budget when combined with higher
  ranked picks. `ai` and `javascript-time-ago` also exceed 5 MB unpacked.
- Zod exceeds 5 MB unpacked (6.15 MB); sixth by imports, it justifies its size.
  Installed graph growth for the final set must remain below 60 MB.

Extensions receive the shared major even when they declare another one. The CLI
prints a `# log` warning with package, declared range and provided version if the
range excludes that entire major; JSON mode emits a warning log record. Tags,
URLs and other non-semver declarations cannot establish a mismatch and are skipped.

Failures expose `MissingDependencyError`, `code: MISSING_DEPENDENCY`, and sorted,
deduplicated package names without subpaths. The CLI exits 3. Invalid files or
source keep esbuild diagnostics. Optional imports in a provided graph retain
esbuild's normal try/catch handling.

Raycast's CommonJS globals are supplied by an ESM banner: `__filename` and
`__dirname` derive from the bundled `import.meta.url`. Statically analyzable
`require` calls follow the same policy as imports; dynamic `require` permits
only Node built-ins and otherwise throws `MISSING_DEPENDENCY`.

## Why

A shared pinned allowlist avoids thousands of installs while compatibility is
built. Bundling transitive dependencies does not expose them to extension imports.
Tree shaking unused utils imports avoids linking shim symbols the command never uses.

## Consequences

- This is explicitly an interim strategy until the first release. Production
  should use a thin layer referencing each extension repo's own pinned
  dependencies with minimal disk use, rather than shipping every package.
- No extension-local dependency lookup, source changes, or per-extension installs.
- Bundle paths point into a temporary build directory; assets need provisioning.
- Bundling policy is not a security sandbox for arbitrary Node code.
- Package availability does not imply every API or host operation it uses works.
