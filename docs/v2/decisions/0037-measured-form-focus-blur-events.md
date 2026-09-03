# ADR 0037: Measured Form focus and blur events

- Status: accepted
- Date: 2026-08-29

## Context

The pinned Raycast declaration exposes `onFocus` and `onBlur` on Form fields,
and the corpus census found 359 direct `Form.*` callback attributes across 134
extensions. The existing scene event contract already carries a callback ID
and an optional validated field-value map, but the compatibility adapter had
treated these callbacks as unsupported.

## Decision

- Add `onFocus` and `onBlur` callback properties to every measured Form field
  scene node. Each callback receives its own serialized event ID.
- Reuse the existing `scene.event` value map. When the client supplies the
  field's current wire value, validate and retain it; otherwise use the
  runtime's retained field value. Restore the field value through the same
  codec used by `onChange` before invoking the extension callback.
- Reconstruct Raycast's `Form.Event` shape as `{ type, target: { id, value? } }`.
  Omit `target.value` only when no current value is available.
- Keep focus/blur delivery and field-value validation in the runtime adapter;
  the client remains responsible for deciding when a field receives or loses
  focus and for sending the optional current value.
- Cover the boundary with scene, renderer, adapter, and child-process matrix
  tests. Keep literal CommonJS `require("@raycast/api")` as a separate safe
  import-shape allowance backed by the same launcher alias.

## Consequences

Measured Form validation flows can run without an unsupported-API failure, and
the event contract remains transport-neutral with no new wire message type.
Callback-driven rerenders can produce fresh event IDs, so clients and tests
must use the current scene transaction after a callback changes the tree.
Client focus behavior, toast timing/stacking, and other unmeasured desktop
surfaces remain outside this decision.
