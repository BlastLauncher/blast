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
Branch/commit:
Verify:
Done:
Not done / risks:
```
