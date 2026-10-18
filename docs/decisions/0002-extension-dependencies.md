# 0002 — Extension dependency resolution

Status: accepted 2026-10-18

## Decision

Extensions run without installing their dependencies. The host's esbuild plugin
resolves extension imports in this order:

1. `@raycast/api`, `react`, and `react/*` stay external. The runtime supplies
   the shim and its single React instance.
2. `@raycast/utils` resolves from the host's pinned dependency, never from the
   extension. Its implementation and transitive dependencies are bundled;
   the same API/React external rules apply throughout this dependency graph.
3. Node built-ins stay external.
4. Any other bare package import fails, even if installed in the extension or
   elsewhere in the workspace. Relative extension source imports still work.

Failures expose `MissingDependencyError` with `code: MISSING_DEPENDENCY` and a
sorted, deduplicated `packages` array of package names (without subpaths).
The CLI prints the names and exits 3. Missing files and invalid source retain
esbuild's diagnostics instead of being classified as missing packages.

## Why

One centrally pinned utils version avoids thousands of dependency installs and
keeps resolution reproducible. Bundling its dependency graph permits internal
implementation dependencies without making them available to extensions.
Syntax minimization drops unused named shim imports from utils' monolithic
entry; used APIs still require implementations in the runtime.

## Consequences

- No extension-local `node_modules` lookup for bare imports. Adding another
  provided package requires an explicit policy change.
- This is a bundling policy, not a security sandbox for arbitrary Node code.
- Utils availability does not imply its entire API works: helpers needing
  unimplemented Raycast symbols remain compatibility work.
