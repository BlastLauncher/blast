---
id: "0076"
title: Close engine-side coverage partials (rememberUserChoice, fallbackText, Cache directory, getContent, SubmitForm, PasteAction)
status: doing
milestone: M5
depends: ["0065"]
---

## Goal

The non-deprecated `partial` entries that belong to the engine and runtime
(not the client) reach `covered`, with tests carrying `@covers` evidence.

## Context

- List them with `rg -n "@covers .* partial" packages` after 0065 merges.
  Expected here:
  - `Alert.Options.rememberUserChoice`: persist the choice per
    command/alert in `blast:internal` storage and skip the alert next time;
  - `LaunchProps.fallbackText`: launch option through `extension.launch` and
    the CLI;
  - `Cache.Options.directory`;
  - `BrowserExtension.getContent`: format conversion and CSS selectors are
    the embedder's job; document how the result passes through;
  - `Action.SubmitForm` / `onSubmit`;
  - `PasteAction` / `CopyToClipboardAction` / `ActionPanelItem` (deprecated
    aliases, but listed partial).
    Read each test's comment to learn why it is partial.
- If a partial is partial because only an embedder can complete it, make the
  catalog entry or docs say so and leave the tag, with a one-line reason in
  Handoff.

## Acceptance

- [x] Each entry above is `covered` or has a documented embedder-only reason.
- [x] `bun run compat:report` leaves no diff; Handoff lists the counts
      before → after.
- [x] `bun run verify` passes.

## Out of scope

- Client-core semantics (0065), deprecated symbols that are _missing_ (0071).

## Handoff

Branch/commit: t3/engine-side-partials @ 29ba7ed1c57094061fa61d9c60864578e3bc8b7f (implementation; subsequent commit records this handoff).
Verify: verify: PASS (format ok, lint ok, typecheck ok, compat ok, workflow ok, test ok)
Done:

- Cache honors a custom parent directory; fallback text reaches runtime through extension.launch and CLI (including empty strings), with strict wire validation.
- Alerts expose checkbox state/events and persist only opted-in answers in command/alert-scoped internal storage; shutdown does not persist unanswered alerts.
- SubmitForm publishes a failure counter for synchronous/asynchronous false results; documented embedder feedback and Reduce Motion handling.
- Deprecated clipboard/paste/action aliases now inherit their fully covered implementations. Generated non-deprecated counts: covered 1527 → 1533, partial 7 → 1, missing 0 → 0; deprecated: covered 665 → 889, partial 224 → 0, missing 50 → 50.
- Regression tests cover cache isolation, fallback transport, alert restoration/isolation and submit failure signaling. No dependencies added; compat:report regeneration is clean.
  Not done / risks:
- BrowserExtension.getContent remains partial: tab access, CSS selection and HTML/text/markdown conversion require embedder browser access; documented in docs/capabilities.md. Runtime already validates/forwards options and passes the returned string through.
- Embedders must render the alert checkbox and submit-failure feedback; reset remembered choices via internal storage. Reference launcher UI additions are outside engine scope.
- Task 0067 must regenerate its schema after merging the new optional InitCommand.fallbackText field. Its schema/docs files were not touched; the serve launch request remains unchanged.
