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

- [ ] `packages/alfred/src/file-filter.test.ts` tests `matchesUti` (exact + supertypes + folders), `buildMdfindQuery` (escaping, UTIs, `not` exclusions, date ranges), `searchFilesPortable` (scopes, UTIs, exclusions, date range, sort modes, limit, `AbortSignal`), and `searchFiles` fallback behavior.
- [ ] `packages/alfred/src/manifest.test.ts` tests `input.filefilter` entry mapping (`mode: "view"`, slug, icons, reachable UI).
- [ ] `packages/alfred/src/runtime.test.ts` tests `input.filefilter` both as a top-level command and via mid-graph handoff with dynamic `scopes` override (verifying `List.Item` rendering with `fileIcon`, search updates, primary downstream routing, and `Reveal in Finder` / `Open File` capabilities).
- [ ] `packages/alfred/src/support.test.ts` passes with `alfred.workflow.input.filefilter` included (39 supported object types).
- [ ] `docs/alfred.md` is updated (≤ 120 lines) and `bun run verify` passes.

## Out of scope

- Alfred Automation Tasks (`alfred.workflow.automation.task`, Task 0213).

## Handoff

```
Branch/commit:
Verify:
Done:
Not done / risks:
```
