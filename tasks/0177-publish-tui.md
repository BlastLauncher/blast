---
id: "0177"
title: "Publish @blastlauncher/tui (bin blast-tui, bundled tmux extension)"
status: doing
milestone: M11
depends: ["0174", "0175"]
---

## Goal

`bunx @blastlauncher/tui@<version> --popup` runs the terminal palette from an
npm install, with the `tmux` extension bundled and opened by default.

## Context

- Decision 0016 point 1. Today `packages/tui` is not in
  `scripts/release/build.ts` `packages`. Add it: emitted JS needs Bun at run
  time (OpenTUI); the bin `blast-tui` starts with `#!/usr/bin/env bun`.
  Ship `extensions/tmux` in the tarball (its `.tsx` sources as-is: the engine
  bundles extensions at launch).
- `blast-tui` with no extension dirs opens the bundled `tmux` extension;
  `--no-builtin` skips it. Given dirs are added after it.
- `release:smoke` installs the tui tarball in a temp dir and runs
  `bun node_modules/.bin/blast-tui --version` (add `--version`) plus a
  headless check that the bundled extension's manifest loads.
- The real npm publish needs the user's one-time bootstrap for the new
  package name (`bun run release:bootstrap` prints it): do not publish.

## Acceptance

- [ ] `bun run release:build` emits `blastlauncher-tui-*.tgz` containing
      `extensions/tmux`; `bun run release:smoke` passes and checks it.
- [ ] `bun run verify` passes.

## Out of scope

- Publishing, the plugin repo.

## Handoff

```
Branch/commit: t3/publish-tui-tarball @ 8db155e
Verify: verify: PASS (format ok, lint ok, typecheck ok, compat ok, protocol ok, mac-fixtures ok, workflow ok, test ok) in 137.0s
Done:
- `blast-tui` defaults to the bundled tmux extension, with `--no-builtin` and `--version` support.
- Release builds emit `@blastlauncher/tui` with the `blast-tui` bin and bundled `extensions/tmux` sources/assets.
- Release smoke installs the tarball, runs the installed version command, and checks the bundled tmux manifest.
- Release manifest tests cover the TUI package files and bin.
Not done / risks: The smoke check uses a manifest-only tmux validation when tmux is unavailable.
```
