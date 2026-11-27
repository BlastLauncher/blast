---
id: "0207"
title: Alfred script runner, dynamic placeholders, and workflow graph engine
status: doing
milestone: M21
depends: ["0206"]
---

## Goal

Implement the Alfred script execution layer (`scripts.ts`), dynamic
placeholder expander (`placeholders.ts`), and workflow graph execution engine
(`graph.ts`) inside `packages/alfred/`.

## Context

- Follows `docs/decisions/0021-alfred-workflows.md` and builds on
  `packages/alfred/src/workflow.ts` and `packages/alfred/src/manifest.ts` (0206).
- All code must run on Node 24 without a build step (erasable TypeScript only,
  explicit `.ts` extensions, zero external npm dependencies).
- Small addition to `packages/alfred/src/workflow.ts`: preserve optional
  `inboundConfig?: PlistDict` on `AlfredObject` (from `entry.inboundconfig`) so
  `output.callexternaltrigger` can also target Alfred 5 objects with
  `inboundconfig.externalid`.
- `packages/alfred/src/scripts.ts`:
  - Export `ScriptInterpreter`, `resolveScriptCommand(config, workflowDir, query, platform?)`,
    `escapeQuery(query, mask)`, `buildWorkflowEnv(options)`, and
    `runWorkflowScript(options): Promise<ScriptResult>`.
  - Support all 12 Alfred script `config.type` values:
    - `0`: `/bin/bash`
    - `1`: `/usr/bin/php`
    - `2`: `/usr/bin/ruby`
    - `3`: `/usr/bin/python`
    - `4`: `/usr/bin/perl`
    - `5`: `/bin/zsh`
    - `6`: `/usr/bin/osascript` (macOS only; clean error on non-darwin)
    - `7`: `/usr/bin/osascript -l JavaScript` (macOS only; clean error on non-darwin)
    - `8`: External Script (`config.scriptfile`, resolved inside `workflowDir`)
    - `9`: `/usr/bin/python3`
    - `10`: `/usr/bin/swift`
    - `11`: `/bin/zsh --no-rcs`
  - Support both `scriptargtype === 1` (`argv`: pass query string(s) as
    positional arguments; for shell `-c`, pass `["-c", script, "--", ...args]`
    so `$1`/`$@` match Alfred!) and `scriptargtype === 0` (`{query}`
    substitution with Alfred's `escaping` bitmask: `1` space, `2` backquote,
    `4` double quote, `8` brackets `[](){}`, `16` dollar `$`, `32` backslash `\`,
    `64` single quote `'`, `128` semicolon `;` — escape backslashes first).
  - `buildWorkflowEnv` populates `alfred_version` (`"5.5"`),
    `alfred_workflow_bundleid`, `alfred_workflow_name`, `alfred_workflow_uid`,
    `alfred_workflow_version`, `alfred_workflow_description`,
    `alfred_workflow_data` (`supportPath`), `alfred_workflow_cache`
    (`<supportPath>/cache`), `alfred_theme_background` (dark/light rgba),
    `alfred_debug`, workflow `variables`, `userConfig` defaults, user
    preference overrides, and runtime session variables (booleans as `"1"`/`"0"`).
  - `runWorkflowScript` spawns with `cwd = workflowDir`, `detached: true` on
    POSIX so `AbortSignal` / timeout kills the entire process group
    (`process.kill(-pid, "SIGTERM")` then `"SIGKILL"`), captures `stdout`,
    `stderr`, `exitCode`, and respects `maxOutputBytes` (default 16 MiB).
- `packages/alfred/src/placeholders.ts`:
  - Export `PlaceholderContext` and `expandPlaceholders(template, context): Promise<string>`.
  - Expand `{query}`, `{var:name}`, `{const:alfred_workflow_name|bundleid|description|version|data|cache|uid}`,
    `{clipboard}` and `{clipboard:N}` (calling `context.readClipboard(offset)`),
    `{date}`, `{time}`, `{datetime}`, `{isodate}`, `{isotime}`, `{uuid}`,
    `{random:a, b, c}` (using `context.now` / `context.random` / `context.uuid`
    hooks so tests are 100% deterministic!).
  - Support `ignoredynamicplaceholders: true` (expands only `{query}`, `{var:}`,
    `{const:}` when skipped, or caller skips dynamic expansion) and URL-encoding
    helper for `openurl` (`skipqueryencode`, `skipvarencode`, `spaces`).
  - Export `parseAlfredWorkflowEnvelope(text: string): { arg?: string | string[]; variables?: Record<string, string>; config?: Record<string, unknown> } | undefined`
    for `{ alfredworkflow: { arg?, variables?, config? } }` JSON payloads.
- `packages/alfred/src/graph.ts`:
  - Export `GraphHost`, `GraphExecutionOptions`, `GraphExecutionResult`, and
    `executeWorkflowGraph(options): Promise<GraphExecutionResult>`.
  - Traverse enabled connections from a starting node (matching `modifiers`
    bitmask for the entry hop, `sourceOutputUid` for conditional branches,
    tracking `vitoclose`, and enforcing a `maxSteps` cycle guard, default 200).
  - Implement:
    - Utilities: `utility.argument`, `utility.conditional` (`matchmode` 0–6:
      `==`, `!=`, `<`, `>`, regex, `<=`, `>=`, case sensitivity, else branch),
      `utility.junction`, `utility.replace` (literal & regex with case/multiline
      flags), `utility.split` (`outputas: 0` array arg, `outputas: 1`
      `${variableprefix}1..N`), `utility.transform` (0 trim, 1 reverse, 2 lower,
      3 upper, 4 capitalize, 5 strip non-alphanumeric), `utility.json`
      (`alfredworkflow` envelope + `config` override for next node),
      `utility.filter`, `utility.delay` (abortable), `utility.debug`,
      `utility.hidealfred`, `utility.dialog` (delegates to `host.showDialog`
      and routes via matching button `sourceOutputUid` / button index).
    - Actions: `action.script` (runs via `host.runScript`, parses
      `alfredworkflow` JSON stdout envelope if present), `action.openurl`
      (`open.url`), `action.openfile` (`open.path`), `action.revealfile`
      (`finder.show`).
    - Outputs: `output.clipboard` (`clipboard.copy` or `clipboard.paste` when
      `autopaste: true`), `output.notification` (`host.showNotification`),
      `output.largetype` (`host.showLargeType`), `output.writefile` (`type` 0
      overwrite / 1 skip-if-exists / 2 append, `relativepathmode`,
      `createintermediatefolders`, `allowemptyfiles`, `adduuid`),
      `output.callexternaltrigger` → same-workflow `trigger.external` (by
      `config.triggerid`) or object with matching `inboundConfig.externalid`.
    - Interactive UI nodes reached mid-graph (`input.scriptfilter`,
      `input.listfilter`, `userinterface.text`, `userinterface.grid`) hand off
      to `host.openView({ object, input, variables, configOverrides })`.
    - Unsupported objects log a clear warning naming the object type and stop
      that branch without throwing.
- Re-export `scripts.ts`, `placeholders.ts`, and `graph.ts` from
  `packages/alfred/src/index.ts`.

## Acceptance

- [ ] `packages/alfred/src/scripts.test.ts` tests interpreter resolution (all 12 types including external script & non-darwin osascript error), `{query}` escaping bitmask, `buildWorkflowEnv`, real subprocess execution (`argv` and `{query}` modes), and `AbortSignal` process-group termination.
- [ ] `packages/alfred/src/placeholders.test.ts` tests `{query}`, `{var:...}`, `{const:...}`, `{clipboard}` / `{clipboard:1}`, deterministic date/time/random/uuid expansion, `openurl` encoding options, and `parseAlfredWorkflowEnvelope`.
- [ ] `packages/alfred/src/graph.test.ts` tests all implemented utilities, actions, outputs, conditional branching + else branch, `vitoclose` propagation, `alfredworkflow` JSON config/variable forwarding, `callexternaltrigger` + loop guard, interactive UI handoff, and graceful handling of unsupported object types.
- [ ] `node -e 'import("./packages/alfred/src/index.ts").then(m => { if (!m.runWorkflowScript || !m.expandPlaceholders || !m.executeWorkflowGraph) process.exit(1); })'` exits 0 on Node 24.
- [ ] `bun run verify` passes.

## Out of scope

- `@blastlauncher/alfred/main` protocol v1 stdio loop and scene rendering (Task 0208).
- Changes to `packages/host`, `packages/cli`, `packages/serve`, or `packages/tui` (Task 0209).

## Handoff

```
Branch/commit:
Verify:
Done:
Not done / risks:
```
