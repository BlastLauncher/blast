# ADR 0040: Measured empty-string controls

- Status: accepted
- Date: 2026-08-29

## Context

The pinned Raycast declaration defines dropdown item values and titles, Form
checkbox labels, and Form descriptions as `string` without a non-empty
constraint. The adapter had applied an extra non-empty check. The corpus probe
found 18 structured failures in this boundary, primarily empty
`Form.Dropdown.Item` values, plus empty descriptions, checkbox labels, and Grid
dropdown item text.

## Decision

- Type-check those string-valued controls without rejecting the empty string.
- Apply the same rule to Form TagPicker item values and titles, which share the
  same declared string contract.
- Keep non-empty validation for identifiers, action targets, URLs, icons, and
  other values whose semantics require an addressable or visible value.
- Preserve scene-required properties as present even when their string value is
  empty; do not change the scene schema or add a host capability.

## Consequences

Extensions can use empty-string sentinel values and deferred labels without a
false compatibility failure. Non-string values continue to fail at the adapter
boundary, and semantic identifiers or targets retain their stricter checks. The
adapter tests and corpus probe cover the empty-string behavior.
