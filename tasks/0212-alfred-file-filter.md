---
id: "0212"
title: Alfred File Filter with macOS Spotlight and portable fallback
status: doing
milestone: M22
depends: ["0211"]
---

## Goal

Add first-class support for Alfred File Filter objects
(`alfred.workflow.input.filefilter`) in `@blastlauncher/alfred` — exposing them
as commands in `workflowToManifest`, supporting mid-graph `openView` handoffs
(including dynamic `config.scopes` overrides), and searching files via macOS
`mdfind` with a portable Node directory-walk fallback.

## Context

- Builds on `packages/alfred/src/{catalogs,manifest,graph,runtime,support}.ts`
  (0205–0211).
- Real File Filter `info.plist` configs use:
  - `keyword`, `title`, `subtext`, `runningsubtext`, `argumenttype` (0 required,
    1 optional, 2 no arg), `limit` (0 = default cap, positive = cap),
    `scopes` (`string[]`, empty = home dir; supports `~` and `{var:...}`),
    `types` (`string[]` of UTIs, e.g. `public.folder`, `public.png`,
    `public.jpeg`, `com.compuserve.gif`, `org.webmproject.webp`,
    `public.svg-image`, `public.tiff`, `com.microsoft.bmp`, `com.adobe.pdf`,
    `public.plain-text`, `public.image`),
    `fields` (`Array<{ field, not, split, value, words }>` — including negative
    filters like `{ field: "kMDItemDisplayName", not: true, value: ".app" }`),
    `daterange` (`0` all, `1` 1d, `2` 3d, `3` 7d, `4` 30d, `5` 90d),
    `sortmode` (`0` relevance/default, `1` modified desc, `2` name asc).
- `packages/alfred/src/catalogs.ts`:
  - Expand `UTIS` to include `.webp` (`org.webmproject.webp`), `.svg`
    (`public.svg-image`), `.tiff`/`.tif` (`public.tiff`), `.bmp`
    (`com.microsoft.bmp`), `.heic` (`public.heic`), `.csv`
    (`public.comma-separated-values-text`), `.xml` (`public.xml`), `.yaml`/`.yml`
    (`public.yaml`), `.app` (`com.apple.application-bundle`).
  - Export `matchesUti(path: string, isDirectory: boolean, types: readonly string[]): boolean`
    supporting exact UTI matches plus supertype matching (`public.image`,
    `public.audio`, `public.movie`, `public.text`, `public.item`, `public.content`).
- `packages/alfred/src/file-filter.ts`:
  - Export `FileFilterOptions`, `FileFilterMatch`, `buildMdfindQuery(query, config)`,
    `searchFilesPortable(options)`, and `searchFiles(options)`.
  - `buildMdfindQuery`: escapes single quotes/backslashes safely and constructs
    Spotlight predicate for `query`, `types` (`kMDItemContentTypeTree == '...'`),
    `not: true` exclude filters, and `daterange` (`$time.today(-N)`).
  - `searchFilesPortable`: bounded recursive `readdir` walk over resolved
    `scopes` (skipping broken entries/permission errors, skipping hidden
    dot-directories unless query starts with `.`, capping visited entries and
    depth to avoid walking all of `/` or huge trees, honoring `AbortSignal`),
    filtering by query words (case-insensitive substring match on filename),
    `types` (`matchesUti`), `not: true` exclusions, `daterange` (`mtimeMs`),
    `sortmode`, and `limit` (default 50, capped at `MAX_SCENE_ITEMS` = 200).
  - `searchFiles`: on `darwin` runs `/usr/bin/mdfind` with `-onlyin <scope>`
    (falling back to `searchFilesPortable` if `mdfind` errors, is unavailable,
    or returns 0 results for an existing local scope such as an unindexed temp
    directory); off `darwin` uses `searchFilesPortable` directly. Allow
    injecting a custom runner/platform for deterministic unit tests.
- `packages/alfred/src/manifest.ts`, `graph.ts`, `support.ts`, `runtime.ts`,
  `index.ts`:
  - Export `FILE_FILTER = "alfred.workflow.input.filefilter"` from `manifest.ts`
    and add it to `ENTRY_TYPES`, `VIEW_ENTRY_TYPES`, `UI_TYPES`.
  - Add `"input.filefilter"` to `VIEW_TYPES` in `graph.ts` and
    `SUPPORTED_OBJECT_TYPES` in `support.ts`.
  - In `runtime.ts`, add `fileFilterEntry` (and injectable `searchFiles` option
    on `AlfredRuntimeOptions` for deterministic runtime tests). Handle
    `FILE_FILTER` in both `load()` and `openView()` (expanding `{var:...}` in
    `scopes`, `title`, `subtext`).
  - Each matched file renders as `List.Item` (`title: basename`, `subtitle`:
    dirname with home shortened to `~`, `icon: { fileIcon: path }`, actions:
    primary action routes `path` downstream, modifier actions, `Copy Path`
    (`cmd+c`), `Reveal in Finder` (`finder.show`), `Open File` (`open.path`),
    `Show Large Type` (`cmd+l`)).
  - Re-export `file-filter.ts` from `packages/alfred/src/index.ts`.
- Update `docs/alfred.md` (keep ≤ 120 lines!).

## Acceptance

- [x] `packages/alfred/src/file-filter.test.ts` tests `matchesUti` (exact + supertypes + folders), `buildMdfindQuery` (escaping, UTIs, `not` exclusions, date ranges), `searchFilesPortable` (scopes, UTIs, exclusions, date range, sort modes, limit, `AbortSignal`), and `searchFiles` fallback behavior.
- [x] `packages/alfred/src/manifest.test.ts` tests `input.filefilter` entry mapping (`mode: "view"`, slug, icons, reachable UI).
- [x] `packages/alfred/src/runtime.test.ts` tests `input.filefilter` both as a top-level command and via mid-graph handoff with dynamic `scopes` override (verifying `List.Item` rendering with `fileIcon`, search updates, primary downstream routing, and `Reveal in Finder` / `Open File` capabilities).
- [x] `packages/alfred/src/support.test.ts` passes with `alfred.workflow.input.filefilter` included (39 supported object types).
- [x] `docs/alfred.md` is updated (≤ 120 lines) and `bun run verify` passes.

## Out of scope

- Alfred Automation Tasks (`alfred.workflow.automation.task`, Task 0213).

## Handoff

```
Branch/commit: t3/d87ded59 @ b1859f4f (this Handoff is the next commit)
Verify: verify: PASS (format ok, lint ok, typecheck ok, compat ok, protocol ok, mac-fixtures ok, workflow ok, test ok) in 40.9s
Done:
- catalogs.ts: 10 more extensions (webp, svg, tiff/tif, bmp, heic, csv, xml,
  yaml/yml, app), `utiTree` conformance and `matchesUti` (exact, supertypes,
  folders; `.app` folders are application bundles, also for File Utility).
- file-filter.ts: `fileFilterConfig`, `resolveScopes`, `buildMdfindQuery`
  (escapes \ ' " *; attribute names validated), `searchFilesPortable`
  (BFS, sorted, depth 8 / 20k entries, hidden and bundles skipped, abortable),
  `searchFiles` (mdfind -0 -onlyin per scope; injectable runner/platform;
  falls back on error or on 0 results for an existing scope).
- FILE_FILTER is an entry/view/UI type, `input.filefilter` a graph view type
  and the 39th supported type; runtime `fileFilterEntry` (injectable
  `searchFiles`) handles load() and openView() with config overrides.
- Items: basename, `~`-shortened folder, `{ fileIcon }`; Continue, modifier
  connections, Copy Path ⌘C, Reveal in Finder ⌘⇧F, Open File ⌘O, Large Type ⌘L.
- Tests: file-filter, manifest, runtime (top level + JSON Config handoff),
  graph handoff, support; analyze.test.ts now uses action.terminalcommand
  as its unsupported example. docs/alfred.md is 120 lines.
Not done / risks:
- `runningsubtext` is ignored; queries match file names by substring
  (kMDItemFSName), not Alfred's own ranking. Spotlight-only field filters
  (e.g. kMDItemAuthors) are skipped by the portable walk.
- An empty mdfind answer for an existing scope triggers the walk, so a
  genuinely empty home-folder search walks up to 20k entries; mdfind output
  is capped at 2000 paths before sorting.
- Real mdfind was smoke-tested by hand on macOS (Node 24, /System/Applications);
  tests always inject the runner. Diff is ~650 product/docs + ~640 test lines.
```
