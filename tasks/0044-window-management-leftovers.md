---
id: "0044"
title: WindowManagement and remaining API leftovers
status: review
milestone: M3
depends: []
---

## Goal

`WindowManagement` and the scattered remaining non-deprecated gaps outside
Form/AI/BrowserExtension/Tool are covered: `Action.*` leftovers,
`ActionPanel.*`, `Clipboard.*`, `Application`, `FileIcon`,
`FileSystemItem`, `LaunchProps`, `PreferenceValues`, `MenuBarExtra.*`,
`Alert.*`, `Detail.*`, `Grid.*`/`List.*` remainders, `captureException`,
`captureMemorySnapshot`, `clearSearchBar`, `confirmAlert`,
`getDefaultApplication`, `getPreferenceValues`, `showHUD`.

## Context

- List them with: non-covered, non-deprecated entries in
  `compat/raycast-api.json` excluding prefixes `Form`, `AI`,
  `BrowserExtension`, `Tool`, `unstable_AI`, `useUnstableAI`. Many are
  `partial` or type-only and need evidence or a small completion, not new
  subsystems. Decide per path; record any that stay partial with a reason.
- WindowManagement: capabilities `window.*` (e.g. `window.active`,
  `window.list`, `window.desktops`, `window.setBounds`), deny by default;
  read-only ones get neutral headless answers in
  `packages/host/src/headless.ts` (no windows, one desktop) — follow the
  declarations exactly.
- `getDefaultApplication(path)` → capability with a neutral headless answer
  or rejection as Raycast does when none exists. `captureException` and
  `captureMemorySnapshot` log through the runtime log channel (no network).
- Document new capabilities briefly in `docs/architecture.md` and any flag in
  `docs/cli.md`. `@covers`, `compat:report`, `fmt`. Parallel workers: 0042
  (Form files, storage) and 0043 (AI/browser, environment/protocol); avoid
  `form.ts`, `environment.ts` and `packages/protocol`.

## Acceptance

- [x] Tests for every behaviour added; capability granted/denied tests for
      `window.*` and `getDefaultApplication`.
- [x] No non-deprecated path in scope left missing; partials listed with
      reasons in Handoff.
- [x] `bun run verify` passes.

## Out of scope

- Real window manipulation; deprecated aliases (a later sweep).

## Handoff

Branch/commit: `t3/window-management-leftovers-r2` @ `5cc0b41`
(implementation; the following docs commit records this handoff).

Verify: `verify: PASS (format ok, lint ok, typecheck ok, compat ok, workflow ok, test ok) in 55.5s`
— 406 tests passed, zero failed. Final commit verification is also required before handback.

Done:

- Recovered round-1 WIP `af0f1bc` on a new worker branch; corrected type,
  formatting, test, clipboard HTML/PathLike, and coverage-evidence failures.
- Implemented all WindowManagement calls through capabilities with validated
  responses, partial writes, fullscreen bounds, neutral headless reads, and
  explicit grant/denial tests; added `applications.default` and `mcp.install`.
- Added runtime-channel diagnostics, search-clear scene requests, clipboard
  file/HTML/concealed payloads, and manifest preference defaults with overrides.
- Completed type/prop evidence, exported FileIcon, documented capabilities and
  regenerated compat. Scoped non-deprecated missing paths: zero (audit below).
- No dependencies added; no protocol, environment.ts or form.ts changes.

Not done / risks:

- Real window manipulation and MCP installation are client responsibilities;
  CLI grants record requests only. No push. Task 0043 was not merged: the initial
  checkout unexpectedly contained it, so this branch was created directly from
  the WIP before continuing. Orchestrator must reconcile shared tests/docs and
  regenerate compat after integrating the concurrent branches.
- Remaining partials (aggregate components/Props retain partial status when
  one of their properties remains incomplete):
  - `Action.SubmitForm`, `Action.SubmitForm.Props`,
    `Action.SubmitForm.Props.onSubmit`: field collection works; draft-clearing
    semantics based on submission results await the Form/drafts work.
  - `ActionPanel.Submenu`, `ActionPanel.Submenu.Props`,
    `ActionPanel.Submenu.Props.filtering`,
    `ActionPanel.Submenu.Props.filtering.keepSectionOrder`: filtering options
    reach the scene; automatic client filtering/order is unimplemented.
  - `List`, `List.Props`, `Grid`, `Grid.Props`, and each of
    `List.Props.filtering`, `List.Props.filtering.keepSectionOrder`,
    `Grid.Props.filtering`, `Grid.Props.filtering.keepSectionOrder`: automatic
    filtering/order belongs to the client; props are serialized only.
  - `List.Dropdown`, `List.Dropdown.Props`, `Grid.Dropdown`,
    `Grid.Dropdown.Props`, and each dropdown's `Props.filtering`,
    `Props.filtering.keepSectionOrder`, `Props.storeValue`: filtering/order is
    client-owned; stored selections cannot discover options hidden inside custom
    components (existing restoration limitation).
  - `Alert.Options`, `Alert.Options.rememberUserChoice`, `confirmAlert`:
    remember-choice is serialized; persisted choices/reset UI are absent.
  - `LaunchProps.draftValues`, `LaunchProps.fallbackText`: not supplied by the
    current init protocol; outside this task's allowed protocol changes.
  - `MenuBarExtra`, `MenuBarExtra.Props`, `MenuBarExtra.Props.isLoading`:
    retained menu model and open-state-driven unloading await the desktop client
    (decision 0005). Dropped round-1's unsupported complete-coverage claims.
  - `showHUD`: recorded feedback works; actual window close/search/pop effects
    await a desktop client (decision 0004).

Coverage audit: filter non-deprecated inventory entries against
`compat/raycast-api.json`, excluding prefixes `Form`, `AI`, `BrowserExtension`,
`Tool`, `unstable_AI`, `useUnstableAI`; all entries are covered or the partials
listed above. Compat artifacts were generated, not edited manually.
