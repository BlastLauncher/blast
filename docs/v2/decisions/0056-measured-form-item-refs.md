# ADR 0056: Attach measured Form item refs

- Status: accepted
- Date: 2026-08-30
- Decision owners: Blast V2 maintainers

## Context

Raycast Form fields accept refs whose handles expose `focus()` and `reset()`.
The compatibility declarations now publish `Form.ItemReference` and
`FormItemRef`, but the V2 field components were ordinary function components;
React therefore discarded refs before an extension could call them. The V1
adapter already exposed the same handle shape as a no-op fallback.

The V2 scene contract currently has no operation for focusing a particular
control or resetting one field in the client. Adding an unvalidated capability
or an unowned scene mutation would create a host boundary without an accepted
wire contract.

## Decision

- Make every measured Form field component ref-forwarding and attach a stable
  object with callable `focus()` and `reset()` methods.
- Keep those methods no-ops for this slice, matching the existing V1 fallback
  and ensuring ref callbacks and optional chaining remain safe for extensions.
- Defer visible focus and value-reset behavior until a future scene or
  capability decision defines control identity, validation, ordering, and host
  authorization.

## Consequences

- Extensions using measured Form refs no longer receive a silently missing
  ref handle during V2 rendering.
- The adapter does not claim client-side focus or reset behavior; the current
  handle is a compatibility bridge, not a control transport.
- The handle shape is covered for text, textarea, password, checkbox,
  dropdown, date, tag, and file fields.

---
