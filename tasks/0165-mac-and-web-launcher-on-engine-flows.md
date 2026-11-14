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
Branch/commit: t3/9fe212e3 @ HEAD (round 2 on top of t3/mac-web-launcher-engine-flows @ cf5c863)
Verify: verify: PASS (format ok, lint ok, typecheck ok, compat ok, protocol ok, mac-fixtures ok, workflow ok, test ok) in 193.3s
Done:
- Finding 1 (macOS input routing): new `BlastPresenter/LauncherRouter.swift` (pure Swift)
  owns the root/session ids. Input goes to the root until `rootLaunched`, then to that
  session until its `exited`, then back to the root. Only the active handle's views
  are drawn, and events for other roots or sessions are ignored. It also keeps the
  first `root.view`, which serve writes before the `root.open` response. LauncherApp
  uses it (201 lines, was 221). `LauncherRouterTests.swift` covers the four required
  cases plus the early root view. Commit d3ad1a3.
- Finding 2 (skipped web test): `server.test.ts` main test runs again on the root
  flow: root view lists hello-list, primary launches it, its rows stream, search
  input reaches it, clipboard.copy {text: "banana"} is forwarded, `back` returns to
  the root, and 415/403/400 (and /launch without a command) are rejected. Commit 415789a.
- Finding 3 (contract fixtures): `mac-fixtures.ts` records `root.json` (hello-list via
  root.open) and `prompt.json` (0157 prompt fixture: engine-handle with a required
  password preference and text argument, launched by root primary → root.launched →
  form view). Presenter tests `root` and `prompt` decode and present them. To present
  the root's per-extension section rows, list rows of kind `section` now map to a new
  disabled `LauncherRow.Kind.section`, which the table does not select. Commit 9987afa.
- Line counts (round 1 → now): web server.ts 228 → 199; macOS LauncherApp 274 → 201 (+58
  LauncherRouter), LauncherBehaviours 137 → 87, LauncherCommandPicker 118 → deleted.
- Picker grep: `rank|picker|catalog` in both examples finds only BlastKit's capability
  catalog (welcome message), which is unrelated.
Not done / risks:
- Swift was not compiled here (Linux). I read it for Sendable/MainActor/switch issues.
  Mutating router calls are kept outside `#expect`. macOS CI (`example:mac`) must
  confirm after the orchestrator merges.
- Web launcher still has the `/launch` endpoint and `command` option from before. Both
  now just reopen the root and ignore the command name. Left as is (outside the
  findings); a follow-up could remove them or make `command` search and launch from the root.
```
