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

The allowlist is a strict prefix of corpus `imported` rank
(`compat/dependencies.json`), gated by: no native addons, install hooks or
browser/CLI binary; not macOS-only automation; and the running `du`-measured
`node_modules` total at or under 75 MB (interim, raised from 60 MB to admit
`date-fns`). Once a pick would cross the budget, every lower-ranked package is
excluded too, even a smaller one that would fit alone — never drop a
higher-ranked pick to seat a lower-ranked one.

13 result, each pinned at its most-declared major (names, versions and sizes
in `packages/host/src/dependencies.ts` and `compat/DEPENDENCIES.md`).
`run-applescript` (rank 4) is
excluded outright as non-portable automation. `date-fns` (rank 3) keeps past
the 15 MB single-package guard by explicit decision: its real installed graph
is 28 MB (`du`), not the 10.9 MB registry `dist.unpackedSize` — unpacking
every function and locale as its own file costs over a third of the whole
budget, but the third most-imported package outweighs that. Everything else
ranked below the 13th pick fails no filter; it is excluded solely because the
next one already crosses the 75 MB cap.

Extensions receive the shared major even when they declare another one; the CLI
prints a `# log` warning (JSON mode: a warning log record) naming the package,
declared range and provided version when the range excludes that major entirely
— tags, URLs and other non-semver declarations are skipped. Failures expose
`MissingDependencyError`, `code: MISSING_DEPENDENCY`, and sorted, deduplicated
package names without subpaths; the CLI exits 3. Invalid files or source keep
esbuild diagnostics, and optional imports in a provided graph retain esbuild's
normal try/catch handling.

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
