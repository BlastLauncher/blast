---
id: "0027"
title: Raycast-like build layout for assets; popToRoot
status: doing
milestone: M3
depends: []
---

## Goal

Bundled commands see the same file layout as in Raycast — `assets/` next to
the bundle, so `environment.assetsPath` and `path.join(__dirname, "assets",
…)` both resolve to the extension's real assets — and `popToRoot` works.

## Context

- Today `bundleCommand` writes `<cmd>.mjs` into a temp build dir and the host
  defaults `environment.assetsPath` to `<build dir>/assets`, which does not
  exist (`packages/host/src/bundle.ts`, `session.ts`; decision 0002 notes
  `__dirname` points at the build dir).
- Make the build dir mirror Raycast: place a symlink (or, where symlinks are
  unavailable, a read-only copy with a size cap) named `assets` pointing at
  `<extensionDir>/assets`, and have `bundleCommand` return `assetsPath` so the
  session passes it explicitly. Never modify the extension directory.
- Image props that reference asset file names (e.g. `icon: "logo.png"`) are a
  client concern; no change needed beyond a correct `assetsPath`.
- `popToRoot({ clearSearchBar? })` pops the navigation stack to the root entry
  (see `docs/decisions/0003-navigation.md`); `clearSearchBar` is recorded.
  Blocks one curated command.
- Tests: fixture extension with an `assets/` file read via both
  `environment.assetsPath` and `__dirname`; popToRoot from depth 3.
- `@covers`, `bun run compat:report`, `bun run corpus:smoke`, commit reports
  after `bun run fmt`. Another worker changes capability APIs (0026) and the
  smoke broker; avoid `scripts/corpus/smoke*.ts` and clipboard/app files.

## Acceptance

- [ ] Both asset access styles work in a bundled fixture; extension dir is
      untouched (assert no new files).
- [ ] popToRoot test; `bun run verify` passes.

## Out of scope

- Grid; menu-bar commands; asset serving to clients.

## Handoff

```
Branch/commit:
Verify:
Done:
Not done / risks:
```
