---
id: "0157"
title: Launch prompts and dependency installs as views
status: doing
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
Branch/commit: t3/44172e57 @ d22219d
Verify: verify: PASS (format ok, lint ok, typecheck ok, compat ok, protocol ok, mac-fixtures ok, workflow ok, test ok) in 138.1s
Done:
- client-core `prompt.ts`: `createPromptController` builds a form scene (preferences + arguments; password, dropdown, checkbox, file) and a status scene (animated/failure toast, Retry) and runs them through the real controller; answers return as submit/retry/cancel effects. Root gets a Configure Command action (+ ⌘⇧, key, `configure` effect).
- host `launch-flow.ts`: `startLaunchFlow(handle, command, { views, launch?, configure? })` = form for missing values -> save -> install deps behind an animated toast (failure toast with Retry) -> launch. In-process `engine.root` uses it by default; serve shares it.
- serve/protocol (additive, v1): `extension.launch { prompts }` (session id returned at once, same id carries prompt then command views), new `extension.configure`; `root.open` launches use prompts and Configure Command; schema regenerated. Without `prompts` the old rejections are unchanged.
- Tests: client-core prompt/root, host launch-flow/root, protocol schema, serve (form -> list with prefs persisted in dataDir; fake-`npm` on PATH for animated install, failure + Retry; configure; root prompts + configure). Docs: new `docs/launch-prompts.md` (embedding.md is at its 150-line limit), embedding.md, architecture.md.
Not done / risks:
- `prompts` always installs dependencies, ignoring `--dependencies manual`; non-missing-value errors (broken bundle) still reject / end the session with an error rather than a toast.
- The serve install test uses a fake `npm` shell script on PATH (POSIX only), since serve runs as a subprocess.
- First `session.view` of a prompt session is the form/toast (empty placeholder suppressed); after the flow, an empty loading command view is sent to replace the last prompt view.
- appPicker preferences are a plain text field; no OAuth, no new field types.
```
