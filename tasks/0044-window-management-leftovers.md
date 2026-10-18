---
id: "0044"
title: WindowManagement and remaining API leftovers
status: doing
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

- [ ] Tests for every behaviour added; capability granted/denied tests for
      `window.*` and `getDefaultApplication`.
- [ ] No non-deprecated path in scope left missing; partials listed with
      reasons in Handoff.
- [ ] `bun run verify` passes.

## Out of scope

- Real window manipulation; deprecated aliases (a later sweep).

## Handoff

```
Branch/commit:
Verify:
Done:
Not done / risks:
```
