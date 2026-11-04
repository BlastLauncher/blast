---
id: "0100"
title: Make dependencies an explicit part of launch (decision 0012)
status: doing
milestone: M6
depends: []
---

## Goal

An embedder learns that a command needs dependencies from a typed launch
error, can install and launch in one call, and can opt into automatic installs,
both in process and over `blast serve`.

## Context

Read `docs/decisions/0012-launch-dependency-policy.md` first; it is the spec.

Today `extension.dependencies.check()` / `install()` exist
(`packages/host/src/extension.ts:217-226`), and so do the matching serve
methods and `dependencies.log` events (`packages/protocol/src/embedder.ts`,
`embedder-schema.ts`, `packages/serve/src/main.ts:192`). But `launch()` never
consults them: a missing package surfaces as `MissingDependencyError` from
`packages/host/src/bundle.ts:710,727`.

Follow the existing `missing_values` launch error (0011 item 5) for shape and
placement. Regenerate the embedder JSON schema with its generator; the
protocol check in `bun run verify` must pass. Update `docs/embedding.md`,
`docs/decisions/0011-embedder-protocol.md` (one line under methods/errors) and
`docs/cli.md` for `--dependencies`.

Tests inject the installer (as existing dependency tests do); no registry
access in `bun test`.

## Acceptance

- [ ] In process: launching a command with an unresolved dependency rejects
      with `DependenciesRequiredError` carrying `unresolved`, `installable` and
      `pinned`; no bundle is attempted.
- [ ] `launch(name, {installDependencies: true})` installs through the injected
      installer, emits progress, then renders; without the flag nothing is
      installed.
- [ ] `createEngine({dependencies: "auto"})` installs by default; a launch with
      `installDependencies: false` does not.
- [ ] Over `blast serve`: `missing_dependencies` error with the same data,
      `installDependencies` on `extension.launch`, `--dependencies auto`, and
      `dependencies.log` events during the install; covered by serve tests.
- [ ] The TUI and `blast run` use the typed error instead of their own checks,
      with their existing behaviour kept (TUI still offers the install).
- [ ] Corpus smokes and the sweep are unchanged (`installedDependencies: false`).
- [ ] Docs updated as listed; `bun run verify` passes.

## Out of scope

- Changing install mechanics (0008), the shared fallback, or the sandbox.
- Rerunning any corpus smoke or sweep.

## Handoff

```
Branch/commit: t3/fix-launch-dependency-preflight @ 74b1c7f
Verify: verify: PASS (format ok, lint ok, typecheck ok, compat ok, protocol ok, workflow ok, test ok) in 52.6s
Done:
- Removed source-text import scanning; launch preflight now uses manifest dependencies, the install key and shared fallback.
- Converted esbuild graph failures from nested imports into `DependenciesRequiredError`, with one install/retry for declared packages and no install for undeclared ones.
- Updated the CLI and TUI to surface typed dependency failures and added host/serve/TUI regressions for comments, nested imports, retry and installability.
Not done / risks: No corpus smoke or sweep was run, per task scope. The TUI keeps its background install prompt and reports a typed launch failure when that install cannot resolve a declared package.
```
