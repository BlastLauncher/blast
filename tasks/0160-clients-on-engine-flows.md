---
id: "0160"
title: Reference clients on engine-owned flows; docs refresh
status: todo
milestone: M9
depends: ["0157", "0158", "0159"]
---

## Goal

The reference clients use the engine root view and launch prompts instead of
their own pickers and prompt forms, and every doc and landing snippet shows
the final, smaller API.

## Context

- Decision 0014 consequences. Migrate: `packages/tui` picker and preferences
  prompt, `examples/macos-launcher` (`LauncherCommandPicker.swift`,
  presenter), `examples/web-launcher`. The browser demo was migrated in 0159.
  Keep their UX (look, keys); only the source of the data changes.
- Then refresh: `README.md`, `docs/quickstart.md`, `docs/embedding.md`, the
  landing snippets (`examples/browser-demo/landing.ts` from 0154): root view
  in every path, `hello.views`, prompts, the web package, Python example.
  Remove any "coming in M9" notes.
- Report before/after line counts for each client.

## Acceptance

- [ ] `grep -rn` shows no client-side command ranking or preference-form
      building left in `packages/tui/src` and the examples (list leftovers
      with reasons in Handoff).
- [ ] TUI tests, `bun run example:mac` (macOS CI), web-launcher tests, site
      e2e pass.
- [ ] Every quickstart path re-run from tarballs as in 0153 (output in Handoff).
- [ ] `bun run verify` passes.

## Out of scope

- New launcher features, visual redesigns, engine changes.

## Handoff

```
Branch/commit:
Verify:
Done:
Not done / risks:
```
