---
id: "0034"
title: ActionPanel.Submenu and the remaining Action variants
status: review
milestone: M3
depends: []
---

## Goal

`ActionPanel.Submenu` (284 extensions) and the remaining built-in actions
work: `Action.Open` (227), `Action.OpenWith`, `Action.ShowInFinder`,
`Action.Trash`, `Action.CreateSnippet`, `Action.CreateQuicklink`,
`Action.ToggleQuickLook`, `Action.PickDate`, `Action.ToggleSidebar` (check
which exist in `compat/raycast-api/index.d.ts`), plus their deprecated
top-level aliases where declared.

## Context

- Follow the existing action pattern (`packages/runtime/src/api/action.ts`):
  scene node type = public path, payloads that may be private (paths,
  snippets) stay out of the scene, privileged effects go through capabilities
  (`open.path` / `open.url` with an `application`, `finder.show`, `trash`,
  `snippet.create`, `quicklink.create`, …) and run the `on*` callback only
  after success. Name every new capability in Handoff; all denied by default.
- `ActionPanel.Submenu`: `title`, `icon`, `shortcut`, `filtering`,
  `isLoading`, `throttle`, `onOpen`, `onSearchTextChange`, children actions
  and sections. `onOpen` must be dispatchable by clients; the CLI gets a
  script command `submenu <title>` that dispatches `onOpen` (document in
  `--help`).
- `Action.PickDate` passes a date back via `onChange` (ISO string on the wire,
  `Date` in the callback); type options from the declarations.
- `@covers`, `bun run compat:report`, `bun run corpus:smoke`, commit reports
  after `bun run fmt`. Other workers: 0033 (curated v3, no package changes)
  and 0035 (selection/file APIs, Form.FilePicker) in parallel; avoid `form.ts`.

## Acceptance

- [ ] Tests per action: scene shape, private payloads, capability granted vs
      denied, callbacks after success; Submenu open/search through dispatch;
      CLI e2e for `submenu`.
- [ ] `bun run verify` passes.

## Out of scope

- Real OS effects (desktop client work).

## Handoff

```
Branch/commit: t3/4af19a47 @ a8cf730 (feat(0034): ActionPanel.Submenu and the remaining Action variants)
Verify: verify: PASS (format ok, lint ok, typecheck ok, compat ok, workflow ok, test ok) in 36.8s — 343 tests, 2853 expect() calls
Done:
- `Action.Open`, `Action.OpenWith`, `Action.ShowInFinder`, `Action.Trash`,
  `Action.CreateSnippet`, `Action.CreateQuicklink`, `Action.ToggleQuickLook`,
  `Action.PickDate` (+ `Type`, `isFullDay`) in
  `packages/runtime/src/api/action.ts`, attached to `Action`, with declared
  deprecated aliases `OpenAction`, `OpenWithAction`, `ShowInFinderAction`,
  `TrashAction`.
- `ActionPanel.Submenu` (`packages/runtime/src/api/action-panel.ts`) with
  title/icon/shortcut/autoFocus/filtering/isLoading/throttle/onOpen/
  onSearchTextChange and actions + sections as children; deprecated alias
  `ActionPanelSubmenu`.
- New capabilities, all denied by default: `finder.show` {path},
  `trash` {paths: string[]}, `snippet.create` {text,name?,keyword?},
  `quicklink.create` {link,name?,icon?,application?}, `quicklook.toggle` {}.
  `Action.Open`/`Action.OpenWith` reuse `open()` → existing `open.url` /
  `open.path` (with application param). Private payloads (target, path, paths,
  snippet, quicklink, application) stay out of the scene and travel only in
  capability params; `on*` callbacks run only after the capability succeeds.
- `Action.PickDate`: ISO strings on the wire (including min/max bounds),
  `Date` in the callback; no capability (client-owned date picker UI).
- CLI script command `submenu <title>` dispatches a submenu's `onOpen`
  (packages/host/src/cli.ts, documented in --help and docs/architecture.md).
- Fixture `fixtures/extensions/actions-variants`; unit tests in
  `packages/runtime/src/api/action-variants.test.ts`, CLI e2e in
  `packages/host/src/cli.test.ts`; `unsupported.test.ts` updated (the two
  formerly-stub paths are implemented).
- `bun run compat:report` regenerated compat/ (covered 944 → 989);
  `bun run corpus:smoke` re-run with unchanged outcomes (62 rendered, 1
  completed, 2 capability-denied, 1 timeout); `.cache/raycast-extensions`
  deleted afterwards.
Not done / risks:
- `Action.ToggleSidebar` does not exist in `compat/raycast-api/index.d.ts` and
  was not implemented (the task said to check).
- CreateSnippet/CreateQuicklink default titles ("Create Snippet"/"Create
  Quicklink") and icons (Icon.Snippets/Icon.Quicklink) are not documented in
  the declarations; chosen to mirror Raycast's built-in actions.
- Real OS effects (desktop client handlers for the new capabilities) remain
  out of scope per the task.
```
