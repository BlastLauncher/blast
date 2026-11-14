---
id: "0165"
title: macOS and web-launcher examples on the engine root view and prompts
status: doing
milestone: M9
depends: []
---

## Goal

`examples/macos-launcher` and `examples/web-launcher` drop their own command
pickers and prompt handling and draw the engine's root view and launch
prompts instead, keeping their look and keys.

## Context

- Decision 0014. macOS: `Sources/BlastPresenter/LauncherCommandPicker.swift`
  (118 lines) plus picker code in `Presenter.swift`/`LauncherBehaviours.swift`.
  Use serve `root.open`/`root.input`/`root.view`/`root.launched`
  (`docs/embedding.md`) through BlastKit (add the root calls and events to
  `Sources/BlastKit/Client.swift`), and send `hello.views`. Root launches
  already use prompts, so a missing preference shows as a form view.
- Web launcher (`examples/web-launcher/server.ts`, in-process): use
  `engine.root(...)` from `@blastlauncher/host`.
- Contract fixtures: `bun run example:mac:fixtures` regenerates the Swift test
  fixtures; add a root view and a prompt form fixture.
- Swift does not build on this Linux host; macOS CI runs `bun run
  example:mac`. Keep Swift changes small and covered by presenter tests.

## Acceptance

- [ ] No command ranking or picker list building left in either example
      (grep in Handoff; leftovers with reasons).
- [ ] Handoff gives before/after line counts for each example.
- [ ] Web-launcher tests pass; macOS CI (`example:mac`) passes on the pushed
      branch or the orchestrator's merge (say which).
- [ ] `bun run verify` passes.

## Out of scope

- TUI (0160), engine changes, visual redesigns.

## Handoff

```
Branch/commit:
Verify:
Done:
Not done / risks:
```
