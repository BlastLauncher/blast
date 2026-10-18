---
id: "0034"
title: ActionPanel.Submenu and the remaining Action variants
status: doing
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
Branch/commit:
Verify:
Done:
Not done / risks:
```
