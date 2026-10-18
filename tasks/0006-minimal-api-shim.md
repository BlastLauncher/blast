---
id: "0006"
title: Minimal @raycast/api shim for List, ActionPanel, Action, Clipboard
status: review
milestone: M1
depends: ["0005"]
---

## Goal

`packages/runtime/src/api/` exports the first `@raycast/api` surface — enough
for a list command with a copy action — rendering host elements through the
task 0005 reconciler and routing `Clipboard.copy` through a capability
requester.

## Context

- Read `docs/decisions/0001-process-and-scene-model.md`; check prop names and
  defaults against `compat/raycast-api/index.d.ts` (the source of truth).
- Host element `type` is the public Raycast path: `List`, `List.Item`,
  `List.Section`, `List.EmptyView`, `ActionPanel`, `ActionPanel.Section`,
  `Action`, `Action.CopyToClipboard`.
- Element-valued props (`actions`, later `detail`, etc.) cannot be props in
  the scene. Render them as a child host element of type `Slot` with
  `props: { name: "<propName>" }` containing the element. Document this
  convention in a short "Scene conventions" section of `docs/architecture.md`
  (that edit is allowed in this task).
- `Action.CopyToClipboard`: default title `"Copy to Clipboard"`; its
  `onAction` handler calls `Clipboard.copy(content)` then `onCopy?.(content)`.
- `Clipboard.copy(content)`: for M1 support `string | number | { text }` →
  capability `clipboard.copy` with params `{ text: string }`; other content
  shapes reject with a clear "unsupported in Blast" error.
- Capability plumbing: `src/api/capability.ts` exports
  `setCapabilityRequester(fn: (name, params) => Promise<JsonValue>)` used by the
  runtime entry later; calling an API without a requester rejects clearly.
- Only implement props that pass straight through as JSON or handlers; do not
  invent behaviour (filtering, HUDs, toasts) — note gaps in Handoff.
- Every shipped symbol and prop gets a `// @covers <path>` tag in the test
  that exercises it (use ` partial` where only some behaviour exists), then
  `bun run compat:report` and commit the regenerated `compat/`.

## Acceptance

- [ ] Tests render each component via `createSceneRoot` and assert scene
      types, props and `Slot` placement; dispatching the copy action calls the
      fake requester with `("clipboard.copy", { text })` and then `onCopy`.
- [ ] Unsupported clipboard content and missing requester reject with clear
      messages (tested).
- [ ] `compat/COVERAGE.md` shows the new covered/partial entries; verify's
      compat step passes.
- [ ] `bun run verify` passes.

## Out of scope

- Module resolution of `@raycast/api` from extension code — task 0007.
- Toasts, navigation, forms, hooks, preferences.

## Handoff

```
Branch/commit: t3/107d0d74 @ 0385ba6
Verify: verify: PASS (format ok, lint ok, typecheck ok, compat ok, workflow ok, test ok) in 1.1s (67 tests)
Done:
  - packages/runtime/src/api/: List (+ .Item/.Section/.EmptyView), ActionPanel
    (+ .Section), Action, Action.CopyToClipboard, Clipboard.copy, and
    capability.ts with setCapabilityRequester/requestCapability; exported as
    `@blastlauncher/runtime/api`.
  - Element-valued props render as `Slot` host children with
    `props: { name: "<propName>" }`; convention documented in the new
    "Scene conventions" section of docs/architecture.md.
  - Action.CopyToClipboard defaults title to "Copy to Clipboard" and its
    internal onAction calls Clipboard.copy(content) then onCopy?.(content);
    Clipboard.copy maps string | number | { text } to the `clipboard.copy`
    capability with { text: string }, other shapes reject with an
    "unsupported content in Blast" TypeError.
  - Tests render every component through createSceneRoot asserting scene
    types, props, Slot placement, handler dispatch (onAction,
    onSelectionChange, copy flow incl. failure → no onCopy), and both
    rejection paths; all shipped symbols/props carry @covers tags
    (9 partial components/namespace, 39 covered props, Clipboard.copy).
  - compat/ regenerated with `bun run compat:report`
    (non-deprecated: 40 covered, 9 partial).
Not done / risks:
  - scripts/compat/coverage.test.ts had an M0-era assertion that the real-run
    coverage is exactly zero ("no product packages yet"); it is stale by
    design now. Relaxed it to assert version 2.8.2 and
    covered + partial + missing == 2473 (denominator guard) while keeping the
    committed-report-matches-regeneration checks. Shared-infra edit outside
    the task's strict scope — flagging for review.
  - Prop types for pass-through values are widened structural minimums
    (ImageLike, Keyboard.Shortcut) since literal unions ship with full
    surface tasks; CapabilityRequester also accepts `undefined` so hosts can
    uninstall.
  - Gaps intentionally not implemented (not invented): List filtering/
    pagination/throttle/onSearchTextChange, deprecated enableFiltering,
    List.Item accessories/accessoryIcon/accessoryTitle/quickLook,
    Action.Style + style prop, Clipboard clear/paste/read/readText,
    CopyToClipboard.transient (deprecated) and CopyOptions are accepted but
    not forwarded (capability carries { text } only), Action deprecated id.
  - Module resolution of `@raycast/api` from extension code (task 0007) and
    the runtime entry that installs the requester remain open.
```

```
Branch/commit:
Verify:
Done:
Not done / risks:
```
