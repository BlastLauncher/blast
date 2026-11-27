---
id: "0208"
title: Alfred protocol v1 runtime and scene renderer
status: doing
milestone: M21
depends: ["0207"]
---

## Goal

Implement the `@blastlauncher/alfred/main` protocol v1 runtime child process
and scene renderer (`scene.ts`, `runtime.ts`, `main.ts`) so Alfred workflows
emit standard Blast `SceneMessage` / `ScenePatchMessage` trees and respond to
Blast `event`, `capability.result`, and `shutdown` messages.

## Context

- Follows `docs/decisions/0021-alfred-workflows.md` and builds on
  `packages/alfred/src/{plist,archive,workflow,manifest,script-filter,scripts,placeholders,graph}.ts`
  (0205–0207).
- Reference implementations for exact Blast protocol v1 & scene conventions:
  - `packages/runtime/src/main.ts` (stdio framing, `createLineDecoder`,
    `encodeMessage`, EPIPE/fatal handling)
  - `packages/runtime/src/core.ts` (handshake, `capability.request`/`result`,
    `scene` / `scene.patch` emission with `diffScene` from `@blastlauncher/protocol`)
  - `packages/client-core/src/view.ts`, `controller.ts`, `feedback.ts`,
    `grid.ts`, `icons.ts` (exact `SceneNode` types and props: `Navigation`,
    `Navigation.Entry`, `List`, `List.Item`, `List.EmptyView`, `Grid`,
    `Grid.Item`, `Detail`, `ActionPanel`, `Action`, `Slot`, `Toast`, `HUD`,
    `Alert` with `primaryAction`/`dismissAction` children, `closeMainWindow`)
- Add `"./main": "./src/main.ts"` to `packages/alfred/package.json` `exports`.
  (Do not add external npm dependencies; only `@blastlauncher/protocol` is
  needed in `packages/alfred/package.json`.)
- `packages/alfred/src/scene.ts`:
  - Build Blast `SceneNode` trees with stable ids and a handler registry
    (`Record<string, (args: JsonValue[]) => void>`) for each published scene.
  - Root is `Navigation` (with `onPop` handler when stack depth > 1 and
    `closeMainWindow: true` when requested) containing one `Navigation.Entry`
    per stack entry (`active: index === stack.length - 1`), followed by active
    `Toast`, `HUD`, and `Alert` children.
  - Views to render:
    1. **Script Filter** (`List`): `navigationTitle`, `searchBarPlaceholder`,
       `isLoading`, `filtering` (`config.alfredfiltersresults === true`),
       controlled `searchText` when updated by autocomplete,
       `onSearchTextChange`, `throttle: true`. Each `ScriptFilterItem` renders
       as `List.Item` (`id`, `title`, `subtitle`, `keywords` from `match`,
       `icon` mapped to `{ fileIcon: path }` for `type: "fileicon"` or path
       string, falling back to `<uid>.png` / `icon.png`). `Slot name="actions"`
       → `ActionPanel`:
       - Primary action: when `item.valid !== false`, runs downstream graph
         with `modifiers = 0` (`item.arg`, `item.variables`); when
         `item.valid === false && item.autocomplete`, autocompletes search text.
       - Modifier actions: union of `item.mods` keys and outgoing connection
         modifier masks (> 0), using `mod.subtitle || connection.modifierSubtext`
         and `shortcut: { modifiers, key: "return" }` (excluding `"fn"` from
         Raycast shortcut modifiers when unsupported, still accessible in panel).
       - Standard Alfred item actions: Copy (`cmd+c`, `item.text?.copy` or
         string `item.arg` → `clipboard.copy`), Show Large Type (`cmd+l`,
         `item.text?.largetext ?? item.title` → pushes Large Type `Detail`),
         Autocomplete (`tab` when `item.autocomplete` is set), Open Quick Look
         URL (`cmd+y` when `item.quicklookurl` is set → `open.url`).
       - `List.EmptyView` when not loading and 0 items (showing error/status).
    2. **List Filter** (`List`): `filtering: true`, static items from
       `parseListFilterItems(config.items)` with `{var:...}`/`{const:...}`
       expanded, `imagefile` icon, primary + modifier actions routing downstream.
    3. **Text View** (`userinterface.text` → `Detail`): `navigationTitle`,
       `markdown`, `isLoading`, `ActionPanel` with Continue (forwards downstream)
       and Copy. Supports `inputtype: 0` (input text) and `inputtype: 1`
       (`inputfile` script returning JSON `{ response, footer, rerun, variables }`
       or plain text/markdown).
    4. **Grid View** (`userinterface.grid` → `Grid`): `columns` (`columncount || 3`),
       `filtering` (`filterable !== false`), `Grid.Item` cells with `content`,
       `title`, `subtitle`, primary + modifier actions routing downstream.
       Supports `inputtype: 0` (file/JSON input) and `inputtype: 1` (`inputfile`
       script returning Script Filter JSON).
    5. **Large Type** (`Detail`): pushed markdown view with Copy & Back.
    6. **Dialog** (`utility.dialog`): 1–2 buttons render as `Alert` (`primaryAction`
       = button1, `dismissAction` = button2); 3 buttons push a chooser `List`
       so all 3 choices remain selectable.
- `packages/alfred/src/runtime.ts`:
  - Export `startAlfredRuntime(io)` with an injectable I/O contract (matching
    `packages/runtime/src/core.ts`: `send`, `onMessage`, `exit`, `log`, plus
    optional `runScript` override for deterministic tests).
  - Protocol flow: wait for `init` (checking `PROTOCOL_VERSION`), emit `ready`,
    load workflow from `init.command.entry` (`info.plist` path or directory),
    resolve entry object UID via `workflowToManifest(workflow).entryUids[init.command.name]`
    (falling back to direct `uid` match), ensure `supportPath` and
    `<supportPath>/cache` exist.
  - Script Filter execution:
    - `argumenttype === 0` (required): wait for non-empty query before running
      unless initial query (`fallbackText` or `arguments.query`) is non-empty;
      `argumenttype === 1 | 2`: run immediately on mount.
    - Debounce according to `queuedelaymode` (`0` = automatic ~250ms,
      `1` = immediate 0ms, `2` = custom `queuedelaycustom * 100ms` or
      seconds; respect `queuedelayimmediatelyinitially === true` for the first
      run). Cancel any in-flight script via `AbortController` on new input.
    - `rerun`: schedule a timer (`rerun * 1000` ms) to re-run the script while
      the view is active; clear on new query, pop, or shutdown.
    - `cache`: cache Script Filter results by `(object.uid, query)` in memory
      for `cache.seconds` (supporting `loosereload` to serve cached items while
      refreshing in the background).
    - After running downstream graph on item action: if `!result.vitoclose`
      and no new view was pushed and no `Alert`/`Detail` is open, set
      `closeMainWindow` (or keep open when `vitoclose: true`!).
  - Keyword / External Trigger entry: run `executeWorkflowGraph` with
    `arguments.query ?? fallbackText ?? ""`; if a UI view was pushed, keep
    running interactively; if not, publish any `HUD`/`Toast`/`closeMainWindow`
    and exit cleanly with code 0.
  - Capability RPC: send `capability.request`, match `capability.result`,
    reject on `ok: false`, cancel in-flight requests on shutdown.
  - Emit `scene` on initial commit (and root changes) and `scene.patch` via
    `diffScene` on incremental updates (decision 0019).
  - `shutdown`: abort all active scripts & graph runs, clear all timers, exit 0.
- `packages/alfred/src/main.ts`:
  - Thin Node stdio entrypoint wiring `process.stdin`/`process.stdout` with
    `createLineDecoder` and `encodeMessage` to `startAlfredRuntime`.
- Re-export `scene.ts` and `runtime.ts` from `packages/alfred/src/index.ts`.

## Acceptance

- [ ] `packages/alfred/package.json` exports `"./main": "./src/main.ts"` and has no external npm dependencies.
- [ ] `packages/alfred/src/runtime.test.ts` feeds emitted scenes through `@blastlauncher/client-core`'s `createController` and covers:
  - Script Filter JSON & legacy XML rendering, search re-execution, `alfredfiltersresults` client filtering, `valid: false` + `autocomplete`, modifier actions (`mods` + connection `modifiers`), Copy (`clipboard.copy`), Large Type (`Detail`), Quick Look (`open.url`), `rerun`, `cache` + `loosereload`, and `vitoclose`.
  - List Filter rendering and downstream graph execution.
  - Keyword entry running a graph (`action.script` → `output.clipboard` / `output.notification` / `utility.hidealfred`) and clean exit vs pushing UI (`output.largetype`, `userinterface.text`, `userinterface.grid`, `utility.dialog`).
  - `scene.patch` reconstruction via `createScenePatchApplier` from `@blastlauncher/protocol`.
  - `shutdown` cancelling in-flight scripts cleanly.
- [ ] A real child-process smoke test spawns `node packages/alfred/src/main.ts` over stdio, sends `init`, receives `ready` + `scene`, dispatches an action, handles a capability request, and shuts down cleanly on Node 24 without a build step.
- [ ] `bun run verify` passes.

## Out of scope

- Integrating Alfred workflows into `packages/host`, `packages/cli`, `packages/serve`, `packages/tui`, or `scripts/release/build.ts` (Task 0209).
- Corpus sweep against external third-party workflows (Task 0210).

## Handoff

```
Branch/commit:
Verify:
Done:
Not done / risks:
```
