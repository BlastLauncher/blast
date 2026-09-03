# ADR 0039: Measured null Form initial values

- Status: accepted
- Date: 2026-08-29

## Context

The pinned corpus probe found 37 structured failures caused by Form initial
values. Thirty-six passed a top-level `null` to a non-date control while
nullable state was being resolved, including TextField, TextArea, Dropdown, and
FilePicker controls. One separate failure passed `[null]` to a string-array
control. The pinned Raycast declaration only types `null` as a Form value for
DatePicker, but real extension runtime values can still contain a top-level
null during asynchronous initialization.

## Decision

- Treat a top-level `null` `value` or `defaultValue` as an omitted/empty initial
  value for non-date Form controls.
- Preserve DatePicker's existing `Date | null` semantics and scene behavior.
- Keep codec validation strict for all other wrong types, including null members
  inside TagPicker and FilePicker string arrays.
- Normalize the value at the adapter boundary; do not change the scene schema,
  add a capability, or broaden the public Raycast declaration types.

## Consequences

Common nullable async state no longer prevents an otherwise compatible Form
from rendering. The scene contract continues to carry only validated values,
and malformed array contents still fail loudly with a structured compatibility
error. The corpus probe and adapter tests cover both the accepted top-level null
and rejected `[null]` case.
