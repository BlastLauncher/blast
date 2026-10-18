# ADR 0058: Preserve nested Form field ref namespaces

- Status: accepted
- Date: 2026-08-30
- Decision owners: Blast V2 maintainers

## Context

The adapter already attached the declaration-shaped `FormItemRef` handle to
measured Form fields and exposed `Form.ItemReference`. Raycast's declarations
also use each field name as a type alias for that handle, for example
`Form.TextField` and `Form.DatePicker`, and expose `Form.DatePicker.Type`.
The deprecated `FormDatePicker`, `FormDropdown`, and `FormTagPicker` values
retain the same static members as their nested counterparts.

## Decision

- Add the measured Form field ref aliases for text, textarea, password,
  checkbox, date, dropdown, tag, and file fields.
- Add the declaration-shaped `Form.DatePicker.Type` type alias.
- Type the deprecated Form field values from the same runtime objects that
  carry the nested date and picker static members.
- Keep the current stable no-op focus/reset handle behavior until a host
  control-command boundary exists.

## Consequences

- Extensions using official `useRef<Form.Field>(...)` spellings compile without
  migration shims.
- Deprecated and nested Form value imports have matching runtime identity and
  static members.
- This is a declaration/runtime-surface parity change; it does not claim native
  focus, reset, or client control behavior.
