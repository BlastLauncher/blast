---
id: "0027"
title: Raycast-like build layout for assets; popToRoot
status: review
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

- [x] Both asset access styles work in a bundled fixture; extension dir is
      untouched (assert no new files).
- [x] popToRoot test; `bun run verify` passes.

## Out of scope

- Grid; menu-bar commands; asset serving to clients.

## Handoff

```
Branch/commit: t3/assets-layout-pop-to-root @ (see last commit)
Verify: verify: PASS (format ok, lint ok, typecheck ok, compat ok, workflow ok, test ok) in 20.5s
Done:
  - bundleCommand links `<outDir>/assets` -> `<extensionDir>/assets` (symlink;
    read-only capped copy fallback, injectable for tests) and returns
    `assetsPath`; session passes it into the default environment
    (packages/host/src/bundle.ts, session.ts).
  - `popToRoot({ clearSearchBar? })` implemented in the runtime: pops the
    current command's stack to the root entry in one step, topmost onPops
    first, records `clearSearchBar` as `Navigation.props.popToRoot` for
    clients (no client search-bar state in Blast) — packages/runtime/src/api/navigation.ts.
  - Fixture `fixtures/extensions/assets` reads an asset via
    `environment.assetsPath` and `path.join(__dirname, "assets", …)`; host
    tests assert the layout, untouched extension dir, copy fallback and cap;
    navigation test asserts popToRoot from depth 3.
  - compat/ reports regenerated; smoke re-run: 53 rendered + 1 completed
    (unchanged); one-thing/remove-one-thing advanced past popToRoot to
    closeMainWindow.
Not done / risks:
  - `closeMainWindow` is the next blocker for one-thing/remove-one-thing
    (window APIs, not this task); `clearSearchBar` is recorded on the scene,
    not acted on, because clients own search-bar state.
  - popToRoot targets the most recently mounted provider (one command per
    runtime process; tests may hold several).
```

