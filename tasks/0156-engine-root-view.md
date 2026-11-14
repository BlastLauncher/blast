---
id: "0156"
title: "Engine root view: search and launch commands across extensions"
status: doing
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
Branch/commit: t3/276b9c9b @ (this commit; worktree branch merged with t3/engine-root-view-icons, a non-ff merge because main moved)
Verify: verify: PASS (format ok, lint ok, typecheck ok, compat ok, protocol ok, mac-fixtures ok, workflow ok, test ok) in 187.3s
Done:
- client-core `root.ts` reworked: live catalog (`setCatalog`), selection by id, "Open Command" actions panel (primary inside it launches), failure toast (`fail`), `reset`, `iconSource` on rows; tests in `root.test.ts`.
- host `engine.root({views, launch?})` (`packages/host/src/root.ts`): catalog from opened extensions' manifests (live via `watch`, open/close tracked by the engine), launch -> command view -> back to root on session exit or `back`; `ready()`; manifests now carry optional `icon`. Host gains a client-core dependency (docs/architecture.md updated).
- serve + protocol (additive v1): `root.open {views?}` -> `{root}`, `root.input`, `root.close`, events `root.view`, `root.launched {root, session}`; the root resumes after `session.exited`. Schema regenerated; protocol and serve tests cover it with two fixture extensions.
- `docs/embedding.md` root section (143 lines).
Not done / risks:
- No "Configure" action: it needs the preference prompts of 0157.
- Serve keeps its own session driver; `host/src/root.ts` has a similar ~25-line scene->controller loop for the in-process mode. Worth unifying in 0160.
- Three full-suite runs on a loaded machine hit unrelated timing flakes in tui/cli/serve tests (all pass in isolation and in the final run).
```
