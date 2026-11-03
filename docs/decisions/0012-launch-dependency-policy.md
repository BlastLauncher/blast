# 0012 — Dependencies are part of launch

Status: accepted 2026-11-04; extends 0008 (installs) and 0011 (protocol)

## Decision

1. **Launch checks dependencies first.** Before bundling, `launch()` runs the
   same check as `extension.dependencies.check()`. If a declared or imported
   package is unresolved, launch fails with a typed error instead of a
   bundle-time `MissingDependencyError`.
2. **Typed failure, like `missing_values`.** In process the error is
   `DependenciesRequiredError` and carries the check result. Over `blast serve`
   it is launch error code `missing_dependencies`, with data
   `{unresolved: string[], installable: boolean, pinned: boolean}`:
   `installable` means an install from the extension's manifest would resolve
   every unresolved package, and `pinned` means a lockfile fixes the versions.
3. **Installing is explicit per launch.** `launch(name, {installDependencies:
   true})` and `extension.launch {..., installDependencies: true}` install
   first (0008 rules: outside the extension, from its lockfile, no install
   scripts), stream `dependencies.log` events, then launch. Without the flag,
   launch never installs.
4. **Engine policy sets the default.** `createEngine({dependencies})` and
   `blast serve --dependencies <manual|auto>` accept `manual` (default) or
   `auto`. `auto` makes `installDependencies` default to true; a launch can
   still pass `false`.
5. **Additive to protocol version 1.** The new launch field, error code and
   serve flag are optional; embedders that ignore them behave as before, except
   that the error is now `missing_dependencies` rather than a generic failure.

## Why

An install needs network access and runs third-party code, so the embedder,
not the engine, decides when it happens. A bundle error deep in launch gave
embedders nothing to act on. A typed error with an install flag lets any
embedder show "Install dependencies?" and retry, and `auto` serves embedders
that have already made that choice for their users.

## Consequences

- Embedders handle one more launch error, parallel to `missing_values`.
- The TUI and `blast run` use the typed error instead of their own checks.
- Corpus tooling keeps `installedDependencies: false` (0008); the typed error
  does not change sweep or smoke outcomes.
