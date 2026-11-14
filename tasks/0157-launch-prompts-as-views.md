---
id: "0157"
title: Launch prompts and dependency installs as views
status: todo
milestone: M9
depends: ["0156"]
---

## Goal

Launching a command that lacks required preferences or arguments, or whose
dependencies are not installed, never fails back to the embedder: the engine
shows a form view for the missing values, saves them, installs dependencies
with progress feedback, and then renders the command.

## Context

- Decision 0014 point 2. Today `extension.launch` rejects with
  `missing_values` (`MissingLaunchValuesError`) or `missing_dependencies`
  (`DependenciesRequiredError`) in `packages/host/src/extension.ts` and
  `packages/serve/src/main.ts`; the TUI builds its own preferences form
  (`packages/tui/src`) — use it as the semantic reference.
- Add an opt-in launch flag (e.g. `prompts: true`, default on when launched
  from the root view of 0156) that, instead of rejecting:
  1. emits a form `ControllerView` built from the preference/argument schema
     (types, required, defaults, dropdown data, password fields) through the
     existing form view model (`client-core/src/form-view.ts`);
  2. on submit, saves via the existing preference store and arguments, then
     continues;
  3. installs dependencies when needed, showing an animated-style toast
     (`feedback.toast` with style `animated`) and failure toast with a retry
     action;
  4. then launches and streams the command's views in the same session id.
     Cancel/`back` closes the session (or returns to root).
- Same behaviour in-process and over serve; additive protocol change; schema
  and `docs/embedding.md` updated.

## Acceptance

- [ ] Serve test: fixture with a required password preference and a required
      argument → launch with prompts yields a form view; submitting values
      yields the command's list view; preferences persisted in `dataDir`.
- [ ] Serve test: missing dependency (use the existing installer test seam,
      no network) → toast progress, then the view; installer failure →
      failure toast with a retry action that works.
- [ ] Without the flag, today's rejections are unchanged (existing tests pass).
- [ ] `bun run verify` passes.

## Out of scope

- OAuth flows, client migrations, new form field types.

## Handoff

```
Branch/commit:
Verify:
Done:
Not done / risks:
```
