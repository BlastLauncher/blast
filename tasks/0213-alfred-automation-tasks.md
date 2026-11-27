---
id: "0213"
title: Core Alfred Automation Tasks and task-level coverage reporting
status: doing
milestone: M22
depends: ["0211", "0212"]
---

## Goal

Implement the core Alfred Automation Tasks (`alfred.workflow.automation.task`)
in `@blastlauncher/alfred`, fix real Alfred `utility.conditional` /
`utility.filter` match modes that Automation Task branches depend on, and
upgrade `support.ts` and `scripts/alfred/analyze.ts` to measure Automation
Tasks honestly by individual `taskuid`.

## Context

In the local real-world Alfred workflow corpus, `alfred.workflow.automation.task`
is by far the largest remaining unsupported object type (160 nodes across 53
workflows, 55 distinct `taskuid` values). Roughly 75% of those nodes fall into
four clean groups that fit Blast's architecture with zero new external
dependencies and zero protocol changes:

1. **Files & Folders** (Node.js `fs`/`path`, `catalogs.ts` UTI matching, and
   Blast's brokered `trash` / `open.path` capabilities):
   - `com.alfredapp.automation.core/files-and-folders/path.exists`
   - `com.alfredapp.automation.core/files-and-folders/path.trash`
   - `com.alfredapp.automation.core/files-and-folders/file.read`
   - `com.alfredapp.automation.core/files-and-folders/directory.new`
   - `com.alfredapp.automation.core/files-and-folders/directory.children.sort`
   - `com.alfredapp.automation.core/files-and-folders/directory.children.sort.added.leading.1`
   - `com.alfredapp.automation.core/files-and-folders/finder.move`
   - `com.alfredapp.automation.core/files-and-folders/finder.copy`
   - `com.alfredapp.automation.core/files-and-folders/file.quicklook`
   - `com.alfredapp.automation.core/files-and-folders/file.uti.matching`
   - `com.alfredapp.automation.core/files-and-folders/path.basename`
   - `com.alfredapp.automation.core/files-and-folders/path.dirname`
   - `com.alfredapp.automation.core/files-and-folders/path.extension`
   - `com.alfredapp.automation.core/files-and-folders/path.expand-tilde`
   - `com.alfredapp.automation.core/files-and-folders/path.older-than`
   - `com.alfredapp.automation.core/files-and-folders/path.filter.older-than`
   - `com.alfredapp.automation.core/files-and-folders/path.filter.newer-than`

2. **Text Processing** (pure TypeScript):
   - `com.alfredapp.automation.core/text-processing/text.lines.trim`
   - `com.alfredapp.automation.core/text-processing/text.metrics`
   - `com.alfredapp.automation.core/text-processing/text.lines.empty.remove`
   - `com.alfredapp.automation.core/text-processing/text.encode.percent`
   - `com.alfredapp.automation.core/text-processing/text.decode.percent`

3. **Argument Processing** (pure TypeScript):
   - `com.alfredapp.automation.core/argument-processing/argument.matching`
   - `com.alfredapp.automation.core/argument-processing/argument.count`
   - `com.alfredapp.automation.core/argument-processing/argument.randomise`
   - `com.alfredapp.automation.core/argument-processing/argument.randomise.leading.1`
   - `com.alfredapp.automation.core/argument-processing/argument.leading.x`
   - `com.alfredapp.automation.core/argument-processing/argument.strip.trailing.x`

4. **Desktop / Window / Browser** (brokered through Blast's existing protocol
   capabilities in `packages/protocol/src/capabilities.ts`):
   - `com.alfredapp.automation.core/window-management/windows.current.bounds.set.preset`
     (`window.active` + `window.desktops` + `window.setBounds`)
   - `com.alfredapp.automation.core/window-management/windows.current.bounds`
     (`window.active` → JSON `{"x":...,"y":...,"width":...,"height":...}`)
   - `com.alfredapp.automation.core/window-management/windows.current.bounds.set.custom`
     (`window.active` + `window.setBounds`)
   - `com.alfredapp.automation.core/window-management/windows.current.screen.change`
     (`window.active` + `window.desktops` + `window.setBounds`)
   - `com.alfredapp.automation.core/macOS/app.current`
     (`applications.frontmost`)
   - `com.alfredapp.automation.core/macOS/app.open`
     (`open.path`)
   - `com.alfredapp.automation.extras/web-browsers/frontmost-browser/frontmost.tabs.current`
     (`browser.tabs`)

### Verified real-plist semantics (must match!)

- **Conditional & Filter match modes (`packages/alfred/src/graph.ts`):**
  Real Alfred workflows pair boolean Automation Tasks (`path.exists`,
  `path.older-than`) and checkbox variables (`"1"`/`"0"`) with
  `utility.conditional` modes `5` and `6`:
  - `utility.conditional` (`compareCondition`):
    - `0`: equal (`==`)
    - `1`: not equal (`!=`)
    - `2`: greater than (`>`)
    - `3`: less than (`<`)
    - `4`: matches regex
    - `5`: is true (trimmed lowercased `"true"`, `"yes"`, `"y"`, `"t"`, or a
      finite non-zero number — matching Apple `NSString.boolValue`)
    - `6`: is false (`!isTrue`)
  - `utility.filter`:
    - `0`: equal (`==`)
    - `1`: not equal (`!=`)
    - `2`: matches regex (and `4` may also match regex for backwards compat, or
      keep `compareFilter` clean for `0/1/2` and update `graph.test.ts`).
- **Task settings & return shapes:**
  - `config.taskuid`: string task identifier; `config.tasksettings`: optional
    dict of settings. String values in `tasksettings` must have Alfred
    placeholders expanded via `node.expand(...)` and leading `~` expanded via
    `homeDir` for path fields.
  - `path.exists`: `target_path` (or incoming arg(s)); returns `"true"` if
    every target exists (`stat`), else `"false"`.
  - `path.trash`: `target_path` (or incoming arg(s)); calls
    `host.request("trash", { paths })` (non-empty paths); passes incoming flow
    through (or returns paths).
  - `file.read`: `target_path` (or incoming arg); reads UTF-8 text and emits it.
  - `directory.new`: `target_path` (or incoming arg(s)); `mkdir(..., { recursive: true })`, emits created path(s).
  - `directory.children.sort`: `target_path` (or incoming arg), `sort_order`:
    - default / `"by_name"`: name ascending (case-insensitive)
    - `"by_name_descending"`: name descending
    - `"by_added"` / `"by_created"` / `"by_modified"`: newest first (descending
      timestamp; use `birthtimeMs || ctimeMs || mtimeMs` for added/created,
      `mtimeMs` for modified)
    - `"by_added_descending"` / `"by_added_ascending"` / `"by_modified_ascending"` / `"by_created_ascending"`: handle both explicit ascending/descending variants sensibly.
    - `include_hidden` (boolean, default `false`): skip dotfiles unless `true`.
    - Emits full child paths as `string[]`.
  - `directory.children.sort.added.leading.1`: same as `directory.children.sort`
    with `sort_order: "by_added"`, returning only the first child path as a
    `string` (or `""` if the directory has no matching children).
  - `finder.move` / `finder.copy`: `save_in` (target directory, required),
    `overwrite` (boolean, default `false`). Operates on incoming arg(s)
    (falling back to `target_path` if provided). `finder.move` uses `rename`
    with `cp` + `rm` fallback on `EXDEV`; if destination exists and
    `!overwrite`, throws a clear error. Emits destination path(s).
  - `file.quicklook`: `target_path` (or incoming arg(s)); calls
    `host.request("open.path", { path })` for each path and passes flow through.
  - `file.uti.matching`: **filter** (not boolean!) — `match_string` (UTI, e.g.
    `"public.png"`), `invert` (boolean, default `false`). Checks each incoming
    path via `stat` + `fileUti` + `matchesUti` from `catalogs.ts` and emits the
    matching paths as `string[]`.
  - `path.basename`: `target_path` (or incoming arg(s)), `no_extension`
    (boolean, default `false`) → strips `extname` when `true`.
  - `path.dirname` / `path.extension` (extension without leading dot) /
    `path.expand-tilde`: operate on `target_path` (if set) or incoming arg(s),
    preserving single-string vs array shape.
  - `path.older-than`: `target_path` (or incoming arg), `unit` (number),
    `period` (`"S"` seconds, `"M"` minutes, `"H"` hours, `"D"` days, `"W"`
    weeks; default `"D"`). Compares `now().getTime() - info.mtimeMs > ms`,
    emits `"true"` or `"false"`.
  - `path.filter.older-than` / `path.filter.newer-than`: same `unit` + `period`
    (default `"D"`), filters incoming paths by mtime age vs `now()`, emits
    `string[]`.
  - `text.lines.trim`: `leading` (boolean, default `true`), `trailing`
    (boolean, default `true`); trims each line of input text.
  - `text.metrics`: `metric` (`"words"` default, `"characters"`, `"lines"`,
    `"paragraphs"`); returns count as string.
  - `text.lines.empty.remove`: removes lines that are empty or whitespace-only.
  - `text.encode.percent` / `text.decode.percent`: `encodeURIComponent` /
    `decodeURIComponent` (graceful error on invalid percent encoding).
  - `argument.matching`: `match_string`, `regex` (boolean, default `false`),
    `case_sensitive` (boolean, default `false`), `invert` (boolean, default
    `false`). Filters incoming items, emits `string[]`.
  - `argument.count`: returns `"0"` for empty string `""` or empty array `[]`,
    `"1"` for non-empty string, `String(arr.length)` for array.
  - `argument.randomise`: Fisher-Yates shuffle of incoming items using
    `options.random ?? Math.random`, emits `string[]`.
  - `argument.randomise.leading.1`: picks 1 random item using `options.random`,
    emits `string` (or `""` if empty).
  - `argument.leading.x`: `arguments_number` (integer ≥ 0); emits first `n`
    items as `string[]`.
  - `argument.strip.trailing.x`: `arguments_number` (integer ≥ 0); drops the
    last `n` items (`list.slice(0, Math.max(0, list.length - n))`) as
    `string[]`.
  - `windows.current.bounds.set.preset`: `preset` (default `"half-left"`).
    Supports `"maximise"` / `"maximize"`, `"centre"` / `"center"`,
    `"half-left"`, `"half-right"`, `"half-top"`, `"half-bottom"`,
    `"third-left"`, `"third-centrewidth"`, `"third-right"`, `"twothirds-left"`,
    `"twothirds-centrewidth"`, `"twothirds-right"`, `"quarter-topleft"`,
    `"quarter-topright"`, `"quarter-bottomleft"`, `"quarter-bottomright"`.
    Requests `window.active` and `window.desktops` to determine desktop size
    (finding the desktop matching `win.desktopId`, else active desktop, else
    first desktop), computes `{ position: { x, y }, size: { width, height } }`,
    and calls `window.setBounds`.
  - `windows.current.bounds`: requests `window.active`, extracts numeric
    `{ x, y, width, height }` from `win.bounds` (`{ position: { x, y }, size: { width, height } }` or flat `{ x, y, width, height }`), emits
    `JSON.stringify({ x, y, width, height })`.
  - `windows.current.bounds.set.custom`: `x`, `y`, `width`, `height` (parsed
    numbers); requests `window.active`, calls `window.setBounds` with
    `{ id, bounds: { position: { x, y }, size: { width, height } } }`.
  - `windows.current.screen.change`: `target_screen` (`"next"` default or
    `"previous"`). Requests `window.active` and `window.desktops`, cycles to
    the next/previous desktop, calls `window.setBounds` with `desktopId`.
  - `macOS/app.current`: `out_format` (`"name"` default, `"bundle_id"`,
    `"path"`). Requests `applications.frontmost` and emits the selected field.
  - `macOS/app.open`: `app_list` (newline-separated app names, bundle IDs, or
    paths; fallback to incoming arg(s)). For each non-empty entry, calls
    `host.request("open.path", { path: entry })` (or `{ path, application }` as
    appropriate; `open.path` with `{ path: entry }` works directly with Blast's
    capability schema).
  - `frontmost.tabs.current`: `out_format` (`"url"` default, `"title"`,
    `"url_tab_title"`, `"title_tab_url"`, `"markdown"`), `allow_empty` (boolean,
    default `false`). Requests `browser.tabs`, selects `tabs.find(t => t.active) ?? tabs[0]`.
    If no tab exists: emit `""` when `allow_empty === true`, else throw a clear
    error. Formats tab as `url`, `title`, `${url}\t${title}`,
    `${title}\t${url}`, or `[${title}](${url})`.
  - Unknown or missing `taskuid`: emit the standard unsupported warning
    (`alfred: alfred.workflow.automation.task (${uid}) task ${taskuid} is not supported; that branch stops here`)
    and stop that branch cleanly without crashing.

## Acceptance

1. New module `packages/alfred/src/automation-tasks.ts` (exported from
   `packages/alfred/src/index.ts`) implements all 35 `taskuid`s listed above
   with zero external dependencies and full Node.js 24 erasable-TS compatibility.
2. `packages/alfred/src/graph.ts`:
   - Extends `GraphCapability` with `"trash"`, `"applications.frontmost"`,
     `"browser.tabs"`, `"window.active"`, `"window.desktops"`, and
     `"window.setBounds"`.
   - Adds `"automation.task"` handler delegating to `automation-tasks.ts`.
   - Fixes `compareCondition` to match real Alfred 5 modes (`0: ==`, `1: !=`,
     `2: >`, `3: <`, `4: regex`, `5: is true`, `6: is false`) and fixes
     `utility.filter` so `matchmode: 2` matches regex (`0: ==`, `1: !=`,
     `2: regex`).
   - Unknown/missing `taskuid` logs a warning containing `is not supported` and
     stops the branch cleanly.
3. `packages/alfred/src/support.ts` and `packages/alfred/src/support.test.ts`:
   - Export `AUTOMATION_TASK = "alfred.workflow.automation.task"`,
     `SUPPORTED_AUTOMATION_TASKS: readonly string[]` (all 35 implemented
     `taskuid`s), and a helper `classifyAlfredObject(object)` (or
     `isSupportedAutomationTask(taskuid)`).
   - Keep `SUPPORTED_OBJECT_TYPES` honest (do NOT put
     `"alfred.workflow.automation.task"` in `SUPPORTED_OBJECT_TYPES` as a
     blanket claim; it is supported per `taskuid`!).
   - `support.test.ts` verifies that every `taskuid` in
     `SUPPORTED_AUTOMATION_TASKS` is actually handled by `executeWorkflowGraph`
     (not reported unsupported) AND that an unknown/missing `taskuid` IS
     reported unsupported.
4. `scripts/alfred/analyze.ts` and `scripts/alfred/analyze.test.ts`:
   - Classify `alfred.workflow.automation.task` nodes by `config.taskuid`:
     supported if `taskuid` is in `SUPPORTED_AUTOMATION_TASKS`, otherwise
     unsupported with label `alfred.workflow.automation.task:<taskuid>` (or
     `alfred.workflow.automation.task` when `taskuid` is absent).
   - Add tests covering supported vs unsupported `automation.task` nodes (with
     and without `taskuid`) and verifying `topUnsupported`, `fullySupported`,
     and `coverage`.
5. Comprehensive unit tests in `packages/alfred/src/automation-tasks.test.ts`
   and updated tests in `packages/alfred/src/graph.test.ts` covering:
   - Every single one of the 35 `taskuid`s (including edge cases: `~` expansion,
     placeholders in `tasksettings`, single vs array args, `overwrite: false` vs
     `true`, `directory.children.sort` name & added order, `file.uti.matching`
     with supertypes like `public.image`, `path.older-than` / `path.filter.*`
     with injectable `now`, `argument.randomise` with injectable `random`,
     window presets & custom bounds & screen cycling, `frontmost.tabs.current`
     formats + `allow_empty`, denied capability handling, and unknown `taskuid`
     warning).
   - Updated `compareCondition` (`2: >`, `3: <`, `5: is true`, `6: is false`)
     and `utility.filter` (`2: regex`) tests.
   - End-to-end graph tests chaining real patterns: `path.exists` →
     `utility.conditional` (`matchmode: 5/6`); `directory.children.sort` →
     `file.uti.matching` → `finder.move`; `argument.matching` →
     `argument.count` → `utility.conditional` (`matchmode: 2`).
6. `docs/alfred.md` updated concisely (staying within the 120-line limit
   enforced by `bun run check:workflow`) to note core Automation Tasks, the new
   brokered capabilities (`trash`, `applications.frontmost`, `browser.tabs`,
   `window.*`), and per-task analysis in `alfred:analyze`.
7. `bun run verify` passes with zero errors and zero warnings.

## Out of scope

- macOS-only tasks that require new OS binaries/xattrs/image codecs or UI
  scripting (`path.tags.*`, `image.*`, `clipboard.set.image.data`,
  `clipboard.export`/`import`, `screenshot.interactive`, `dark-mode.set`,
  `app.running`, `app.quit`, `app.current.click.menubar.item`,
  `finder.windows.current`, `shortcut.installed`/`view`,
  `frontmost.tabs.current.run.javascript`, `frontmost.tabs.matching.close`).
- Changes to `packages/protocol/src/capabilities.ts` or new Blast capabilities.
- Committing any third-party workflows or local paths.

## Handoff

```
Branch/commit:
Verify:
Done:
Not done / risks:
```
