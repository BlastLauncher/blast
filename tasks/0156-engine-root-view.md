---
id: "0156"
title: "Engine root view: search and launch commands across extensions"
status: todo
milestone: M9
depends: ["0155"]
---

## Goal

An embedder shows a Raycast-style root search over every opened extension's
commands without writing a picker: the engine serves it as an ordinary list
`ControllerView`, launches the chosen command, and returns to the root when
the command's session ends.

## Context

- Decision 0014 point 2. Today three clients each implement a picker:
  `packages/tui/src/picker.tsx`, `examples/browser-demo/root-launcher.tsx` +
  `root.ts`, `examples/macos-launcher/Sources/BlastPresenter/LauncherCommandPicker.swift`.
  Read them for the shared semantics (ranking via `client-core/src/rank.ts`,
  sections per extension, subtitles, mode labels, actions such as
  "Open Command"/"Configure"), and implement it once.
- client-core: a framework-free root controller (e.g. `root.ts`) that takes a
  command catalog `{extension, command, title, subtitle, icon, mode}[]` and
  produces `ControllerView` (kind `list`, search, rows, actions) from the
  same inputs as the command controller, emitting a `launch` effect on
  primary. No I/O.
- In-process: a helper on the engine (e.g. `engine.root({views})`) that
  builds the catalog from opened extensions' manifests (live via `watch`)
  and drives launch → command view → back to root on session exit or `back`
  at the command root.
- Serve: `root.open {views?}` → `{root: id}` emitting `root.view` events and
  accepting `root.input`; launching from root emits the normal
  `session.view` stream with the new session id plus an event linking it to
  the root (`root.launched {root, session}`), and the root resumes when the
  session exits. Additive protocol v1 change; schema regenerated; documented
  in `docs/embedding.md` (keep ≤ 150 lines).
- Keep the existing pickers as they are; 0160 migrates clients.

## Acceptance

- [ ] client-core tests: ranking/sections, search, selection, primary emits
      launch, actions panel on a command row.
- [ ] Serve test with two fixture extensions: `root.open` → view lists both
      extensions' commands; search narrows; primary launches `hello-list`;
      `back` at its root closes it and a fresh `root.view` arrives.
- [ ] In-process test of the same flow through the engine helper.
- [ ] `bun run protocol:schema`; `bun run verify` passes.

## Out of scope

- Prompts for missing preferences/arguments (0157), aliases, favourites,
  hotkeys, frecency persistence, client migrations.

## Handoff

```
Branch/commit:
Verify:
Done:
Not done / risks:
```
