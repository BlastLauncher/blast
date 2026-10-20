---
id: "0072"
title: Capability catalog in packages/protocol
status: doing
milestone: M5
depends: []
---

## Goal

Embedders get one machine-readable list of every capability the runtime can
request: its params and result shapes, its scope, and the `@raycast/api` calls
that use it. A test keeps the list complete.

## Context

- Decision `docs/decisions/0010` (point 3). Read it, and also
  `docs/capabilities.md` and `docs/architecture.md` "Message flow".
- The runtime requests capabilities only through `requestCapability(name, params, options)`
  (`packages/runtime/src/api/capability.ts`). Find every call site under
  `packages/runtime/src/api/` to get the current names, including the
  `storage.*`, `oauth.*`, `ai.*`, `browser.*`, `clipboard.*`, `open.*`,
  `finder.show`, `trash`, `applications.*`, `selection.*`, `window.*`,
  `mcp.install` and `preferences.open` families.
- Add `packages/protocol/src/capabilities.ts`, exported from the package
  index, containing `CAPABILITIES`: a readonly record keyed by name. Each entry
  has:
  - `scope`: `"session"` when the engine answers it itself (storage,
    internal storage, OAuth tokens, own AI provider: decision 0010 point 2),
    otherwise `"grant"`;
  - `params` and `result`: small JSON-Schema-like objects (`type`,
    `properties`, `required`, `items`, `enum`). Keep them hand-written and
    minimal, matching what the runtime actually sends and expects;
  - `api`: the `@raycast/api` symbol paths that trigger it, e.g.
    `["Clipboard.copy", "Action.CopyToClipboard"]`;
  - `summary`: one line of text.
    Also add a `isCapabilityName(name)` type guard.
- Add `packages/runtime/src/api/capabilities.test.ts`. It statically scans the
  runtime `api/` sources (read the files and regex the
  `requestCapability("…"` literals) and asserts the scan and the catalog key
  sets are equal. It must fail with the offending names when they differ.
- Add `packages/protocol/src/capabilities.test.ts`. It checks that every
  `api` path exists in `compat/raycast-api.json`'s inventory (read the JSON)
  and that every schema is well-formed.
- In `docs/capabilities.md`, add one sentence at the top pointing to the
  catalog as the source of truth. Do not otherwise restructure the file.

## Acceptance

- [ ] `CAPABILITIES` covers exactly the names the runtime requests; the
      runtime test proves it and fails on drift (show this by temporarily
      deleting one entry, then restoring it; mention it in Handoff).
- [ ] `bun test packages/protocol packages/runtime/src/api/capabilities.test.ts`
      passes.
- [ ] `packages/protocol` still has no dependencies.
- [ ] `bun run verify` passes.

## Out of scope

- The handler registry, CLI move (0073), the native package (0074/0075), and
  changing any capability name or runtime behaviour.

## Handoff

Filled in by the worker when finishing:

```
Branch/commit: t3/c0077608 @ 85382b7 (this handoff follows in a doc-only commit)
Verify: verify: PASS (format ok, lint ok, typecheck ok, compat ok, workflow ok, test ok) in 122.6s
Done:
- Added CAPABILITIES in packages/protocol/src/capabilities.ts: 38 entries covering every requestCapability name, each with scope, summary, minimal params/result schemas and @raycast/api trigger paths; plus isCapabilityName() and CapabilityName.
- Exported the catalog from the protocol index and updated the package-surface test.
- Added packages/runtime/src/api/capabilities.test.ts: scans the first argument of every requestCapability(...) call (ternaries included) and fails with missing/extra names; demonstrated drift by deleting clipboard.clear (test reported `missing: ["clipboard.clear"]`) then restoring it.
- Added packages/protocol/src/capabilities.test.ts: every api path exists in compat/raycast-api.json and every schema is well-formed (allowed keys/types, required names existing, array items, unique primitive enums).
- Pointed docs/capabilities.md at the catalog as the source of truth; no dependencies added to packages/protocol.
Not done / risks: ai.ask is marked "session" because the engine answers the extension's own provider; an embedder-supplied AI handler is still possible at runtime. The api lists name the primary triggering paths, not every deprecated alias. No capability names or runtime behaviour changed.
```
