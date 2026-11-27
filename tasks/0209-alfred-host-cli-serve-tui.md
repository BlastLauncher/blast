---
id: "0209"
title: Wire Alfred workflows into host, CLI, serve, TUI, release build, and docs
status: doing
milestone: M21
depends: ["0208"]
---

## Goal

Integrate `@blastlauncher/alfred` into `@blastlauncher/host` (`openExtension`,
`createEngine`, `engine.root()`, `startCommand`), `@blastlauncher/cli`
(`blast run`), `@blastlauncher/serve` (`blast serve`), `@blastlauncher/tui`
(`blast-tui`), `scripts/release/build.ts`, and docs so both unpacked Alfred
workflow directories (`info.plist`) and `.alfredworkflow` archives work
first-class across every Blast surface.

## Context

- Follows `docs/decisions/0021-alfred-workflows.md` and builds on
  `packages/alfred/` (0205–0208).
- `packages/host/package.json`: add `"@blastlauncher/alfred": "workspace:*"` to
  `dependencies`, run `bun install` to update `bun.lock`, and confirm
  `bun install --frozen-lockfile`.
- `packages/host/src/session.ts`:
  - Add optional `runtimeEntry?: string` to `StartOptions` (defaults to
    `fileURLToPath(import.meta.resolve("@blastlauncher/runtime/main"))`).
  - When `options.runtimeEntry` is set, spawn `childNodePath` with
    `[options.runtimeEntry]` and bypass `options.runtimePool` (the standby pool
    prewarms the React runtime, not the Alfred runtime).
- `packages/host/src/alfred.ts`:
  - Export `isAlfredWorkflowPath(path: string): boolean` (synchronous check:
    returns `true` if `path.toLowerCase().endsWith(".alfredworkflow")` or if
    `existsSync(join(resolved, "info.plist")) && !existsSync(join(resolved, "package.json"))`).
  - Export `prepareAlfredWorkflow(path: string, dataDir: string): Promise<{ workflowDir: string; isArchive: boolean }>`
    (for `.alfredworkflow` files, extracts into `join(dataDir, "workflows")` via
    `extractWorkflowArchive`; for directories, returns `{ workflowDir: resolve(path), isArchive: false }`).
  - Export `createAlfredExtensionHandle(options, engineHandlers)` returning the
    exact `ExtensionHandle` shape:
    - `manifest()`: extracts archive once (cached), reads `info.plist` +
      top-level files (`readdir`), calls `loadWorkflow` + `workflowToManifest`,
      caches by `(info.plist size, mtimeNs)`.
    - `assetsDir()`: returns the resolved workflow directory (after extraction
      for archives, or `resolve(options.extensionDir)` for unpacked dirs) so
      `icon.png` and `<uid>.png` resolve cleanly in `root` and `serve`.
    - `watch(listener)`: watches `info.plist` changes in unpacked workflow
      directories; for `.alfredworkflow` files returns a safe no-op unsubscribe
      (never throws `ENOTDIR`).
    - `dependencies`: `check()` returns `{ needed: false, unresolved: [], installable: false, pinned: true }`,
      `install()` returns `{ installed: false, packages: [] }` (matching
      `DependencyInstallStatus` / `installExtensionDependencies` shapes).
    - `preferences()` / `savePreferences()`: uses `createPreferenceStore`
      identically to Raycast extensions.
    - `launch(name, launchOptions)`: checks missing required preferences and
      arguments (`MissingLaunchValuesError`), calls `startCommand` with
      `runtimeEntry: fileURLToPath(import.meta.resolve("@blastlauncher/alfred/main"))`,
      `entry: join(workflowDir, "info.plist")`, `assetsPath: workflowDir`,
      `extensionName: extension.name`, `commandName: name`,
      `mode: command.mode`, `preferenceDefaults`, `preferences: prefs.values`,
      `argumentValues`, `fallbackText`, `launchContext`, `inheritEnv`,
      `dataDir`, and `broker`.
    - `close()`: stops watchers, awaits in-flight launches, shuts down active
      sessions.
- `packages/host/src/extension.ts`, `engine.ts`, `root.ts`, `index.ts`:
  - Add `assetsDir(): string` to `ExtensionHandle` (Raycast returns
    `join(extensionDir, "assets")`; Alfred returns its workflow dir).
  - `createExtensionHandle` delegates to `createAlfredExtensionHandle` when
    `isAlfredWorkflowPath(options.extensionDir)` is true.
  - `packages/host/src/root.ts` uses `handle.assetsDir()` instead of hardcoding
    `join(source.dirOf(handle) ?? "", "assets")`.
  - Re-export `isAlfredWorkflowPath` and `prepareAlfredWorkflow` from
    `packages/host/src/index.ts`.
- `packages/serve/src/serve.ts`:
  - In `stream(...)`, use `get(extensions, extensionKey).assetsDir()` for
    `createController({ ...views, assetsDir })`.
- `packages/cli/src/cli.ts`:
  - In `run(...)`, when `isAlfredWorkflowPath(options.extensionDir)` is true:
    prepare the workflow (`prepareAlfredWorkflow`), load manifest via
    `openExtension` / `loadWorkflow` + `workflowToManifest`, validate `command`
    and `--argument` with the same `UsageError` semantics, and run via
    `startCommand` with `runtimeEntry: @blastlauncher/alfred/main`,
    `entry: join(workflowDir, "info.plist")`, `assetsPath: workflowDir`
    (do NOT set `cleanupDirectory` to `workflowDir` — never delete the user's
    workflow or the extraction cache!).
- `packages/tui/src/cli.ts`:
  - Treat `.alfredworkflow` files as extension sources alongside directories so
    `blast-tui my.alfredworkflow` opens a root, `blast-tui dir my.alfredworkflow`
    opens a root over both, and `blast-tui my.alfredworkflow <cmd>` runs one
    command directly. Preserve existing `parseCliArgs(argv, directory)` test
    compatibility.
- `scripts/release/build.ts`:
  - Add `"alfred"` to `packages` (before `"host"`). Run `bun run release:build --version 0.0.0-dev`
    (or `scripts/release/build.test.ts`) to confirm clean emission and packing
    (and clean up `.cache/release` if not gitignored? `.cache/` is gitignored,
    but check `git status`).
- Docs (keep every file within its `scripts/check-workflow.ts` line limit!):
  - `docs/architecture.md` (≤ 200 lines): note that `host` also opens Alfred
    workflow dirs / `.alfredworkflow` archives and spawns `@blastlauncher/alfred/main`.
  - `docs/cli.md` (≤ 120 lines): note `blast run` accepts Alfred workflow dirs
    and `.alfredworkflow` files.
  - `docs/tui.md` (≤ 120 lines): note `blast-tui` accepts Alfred workflow dirs
    and `.alfredworkflow` files.

## Acceptance

- [ ] `packages/host/src/alfred.test.ts` tests `createEngine` / `openExtension` / `engine.root()` / `startLaunchFlow` on both an unpacked Alfred workflow dir and a `.alfredworkflow` ZIP archive: manifest & icon resolution (`assetsDir()`), required preference prompt & persistence, Script Filter search & action → capability broker (`clipboard.copy`, `open.url`), and Keyword execution.
- [ ] `packages/cli/src/cli-alfred.test.ts` runs `blast run <workflowDir> <cmd>` and `blast run <file.alfredworkflow> <cmd>` with `--script`, `--grant`, and `--json`, verifying scenes, search, actions, and capability grants end-to-end.
- [ ] `packages/serve/src/views.test.ts` (or a new `packages/serve/src/alfred.test.ts`) tests `extension.open` + `root.open` + `root.input` launching an Alfred `.alfredworkflow` over embedder protocol 2 (`root.view`, `session.view`, `session.view.patch`, `capability.request`).
- [ ] `packages/tui/src/cli.test.ts` tests `.alfredworkflow` file arguments in root mode, multi-source root mode, and single-command mode.
- [ ] `bun run release:build --version 0.0.0-dev` succeeds (including `@blastlauncher/alfred`) and leaves no tracked/untracked dirt.
- [ ] `bun run verify` passes (including `check:workflow` line limits).

## Out of scope

- Sweeping or analyzing external third-party Alfred workflow collections (Task 0210).
- Adding new capabilities to `packages/protocol/src/capabilities.ts` or changing protocol versions.

## Handoff

```
Branch/commit:
Verify:
Done:
Not done / risks:
```
