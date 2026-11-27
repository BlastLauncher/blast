---
id: "0211"
title: Support additional Alfred utilities, actions, outputs, and Image View
status: doing
milestone: M22
depends: ["0210"]
---

## Goal

Add 11 high-frequency Alfred object types across utilities, actions, outputs,
and UI views (`utility.joinargs`, `utility.random`, `utility.expression`,
`utility.file`, `action.launchfiles`, `action.applescript`,
`action.systemwebsearch`, `output.playsound`, `output.speak`,
`automation.runshortcut`, and `userinterface.image`) to `@blastlauncher/alfred`,
raising measured execution coverage across real workflows.

## Context

- Builds on M21 (`packages/alfred/src/{graph,runtime,scene,scripts,support}.ts`
  and `docs/alfred.md`).
- Keep all product code Node 24 runnable without a build step (erasable
  TypeScript only, explicit `.ts` extensions, zero external npm dependencies).
- Implement in `packages/alfred/src/graph.ts` (extracting helpers into a small
  `packages/alfred/src/expressions.ts` if cleaner so `graph.ts` stays concise):
  1. `alfred.workflow.utility.joinargs`:
     - Joins `flow.arg` (if array) using unescaped `config.delimiter` (`\n`,
       `\r`, `\t`, `\\`); single string passes through unchanged.
  2. `alfred.workflow.utility.random`:
     - Uses injected `options.random` / `options.uuid` for determinism.
     - `type === 0`: random integer (between `min`/`max` or `0`..`max`, default
       `0..100` or `config.count` / `config.words` range if specified; check
       safe defaults when omitted: `0..999999` or `Math.floor(random() * 100)`).
     - `type === 1`: UUID string (using `options.uuid`).
     - `type === 2`: splits `config.words` on newlines (filtering empty lines)
       and picks one at random.
  3. `alfred.workflow.utility.expression`:
     - Expands placeholders in `config.expression`, then evaluates with a safe
       pure-TS recursive-descent math parser (NO `eval` or `new Function`!):
       supports `+`, `-`, `*`, `/`, `%`, `^`/`**`, unary `+/-`, parentheses,
       decimal numbers, constants `pi`/`e`, and functions `abs`, `round`,
       `floor`, `ceil`, `sqrt`, `min`, `max`, `pow`, `log`, `sin`, `cos`, `tan`.
     - Outputs the numeric result as string (`Number.isInteger(n) ? String(n) : String(n)`),
       rejecting non-finite results (`NaN`/`Infinity`) or syntax errors cleanly
       as a branch warning.
  4. `alfred.workflow.utility.file`:
     - Checks whether the expanded path (`flow.arg`) exists; if
       `config.fileutivariablename` is non-empty, sets that variable to a best-
       effort UTI inferred from path (directory → `public.folder`, extension
       table for `.txt`, `.md`, `.json`, `.pdf`, `.png`, `.jpg`, `.jpeg`,
       `.gif`, `.mp3`, `.mp4`, `.zip`, `.html`, fallback `public.data`); if
       `config.outputfileuti === true`, outputs the UTI, else forwards path.
  5. `alfred.workflow.action.launchfiles`:
     - Reads `config.paths` (string array), expands `~` and placeholders, and
       calls `host.request("open.path", { path })` for each path.
  6. `alfred.workflow.action.applescript`:
     - Runs `config.applescript` via `host.runScript` (type `6` AppleScript)
       wrapping/invoking `alfred_script(item 1 of argv)` with `flow.arg` as
       argument (matching Alfred's `on alfred_script(q)` handler convention!),
       passing returned stdout downstream. Off macOS, fails cleanly with the
       named macOS-only reason from `scripts.ts`.
  7. `alfred.workflow.action.systemwebsearch`:
     - Decodes Alfred's 32-bit big-endian FourCC `config.searcher` integer to
       URL templates (`"awgo"` Google, `"awty"` YouTube, `"awmo"` IMDb, `"awwi"`
       Wikipedia, `"awfb"` Facebook, `"awts"` X/Twitter, `"awwa"` Wolfram|Alpha,
       `"awam"` Amazon, `"awdu"` DuckDuckGo, `"awgi"` Google Images, `"awgm"`
       Google Maps, `"awgh"` GitHub, `"awbi"` Bing, `"awso"` Stack Overflow,
       `"awrd"` Reddit), URL-encodes `flow.arg`, and calls
       `host.request("open.url", { url, ...(browser ? { application: browser } : {}) })`.
     - Unknown `searcher` fails cleanly with a named error including the FourCC.
  8. `alfred.workflow.output.playsound`:
     - Delegates to optional `host.playSound?.({ soundName, systemSound, workflowDir })`.
     - In `runtime.ts`, implement `playSound`: on macOS, resolves system sound
       (`/System/Library/Sounds/<name>.aiff`) or workflow-local file (contained
       inside `workflowDir`, rejecting `..`) and spawns `/usr/bin/afplay`
       (non-blocking or best-effort; logs warning on missing sound/non-macOS
       without crashing).
  9. `alfred.workflow.output.speak`:
     - Expands `config.text || "{query}"` and delegates to optional
       `host.speak?.(text)`. In `runtime.ts`, on macOS spawns `/usr/bin/say`
       (best-effort; logs warning off macOS).
  10. `alfred.workflow.automation.runshortcut`:
      - Expands `config.shortcut` (falling back to `flow.arg` when empty).
      - Delegates to optional `host.runShortcut?.({ name, input, inputMode, outputMode, signal })`
        (default in `runtime.ts`: on macOS spawns `/usr/bin/shortcuts run <name>`,
        passing input via temp/stdin when `inputmode` passes text/arg and
        returning stdout when `outputmode !== 0`; fails cleanly off macOS).
  11. `alfred.workflow.userinterface.image`:
      - Add `"userinterface.image"` to `VIEW_TYPES` in `graph.ts` and `UI_TYPES`
        in `manifest.ts`.
      - In `runtime.ts`, `imageEntry(...)` renders the image path(s) from
        `input` in a `Detail` view (`![<basename>](<path>)` markdown, with
        Continue, Open File (`open.path`), Copy Path (`clipboard.copy`), and
        Back actions!).
- Update `SUPPORTED_OBJECT_TYPES` in `packages/alfred/src/support.ts` (all 11
  new types added; `support.test.ts` continues to verify every single one!) and
  update `docs/alfred.md` (keeping it ≤ 120 lines).

## Acceptance

- [ ] `packages/alfred/src/expressions.test.ts` (or `graph.test.ts`) thoroughly tests the safe math expression parser (operators, precedence, unary minus, parentheses, functions, constants, syntax errors, division by zero / non-finite rejection).
- [ ] `packages/alfred/src/graph.test.ts` tests all 10 new graph objects (`joinargs`, `random` types 0/1/2, `expression`, `file`, `launchfiles`, `applescript`, `systemwebsearch` FourCCs + unknown FourCC, `playsound`, `speak`, `runshortcut`) and `userinterface.image` view handoff.
- [ ] `packages/alfred/src/runtime.test.ts` tests `userinterface.image` rendering a `Detail` view with actions, and `manifest.test.ts` verifies `userinterface.image` counts as reachable UI (`mode: "view"`).
- [ ] `packages/alfred/src/support.test.ts` passes with all 38 `SUPPORTED_OBJECT_TYPES`.
- [ ] `docs/alfred.md` is updated (≤ 120 lines) and `bun run verify` passes.

## Out of scope

- File Filter (`alfred.workflow.input.filefilter`, Task 0212).
- Automation Tasks (`alfred.workflow.automation.task`, Task 0213).

## Handoff

```
Branch/commit:
Verify:
Done:
Not done / risks:
```
