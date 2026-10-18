# ADR 0016: Measured Form surface and validated field values

- Status: accepted
- Date: 2026-08-28

The initial Form boundary in this decision was extended by ADR 0018 to cover
the measured `DatePicker`, `TagPicker`, and `FilePicker` controls.

## Context

`Form` is imported by 38.5% of the measured corpus, but its controls need a
semantic representation and an interaction path before a desktop client can
render or submit them. The existing scene contract carried opaque action event
IDs only; treating form controls as untyped React details would make values
ambiguous at the runtime/client boundary.

## Decision

- Extend the scene vocabulary with a `form` root and typed form nodes for text
  fields, text areas, password fields, checkboxes, dropdowns, dropdown items
  and sections, descriptions, and separators. Form controls use a strict
  property whitelist and require stable field IDs and change callbacks where
  applicable.
- Allow `scene.event` to carry an optional field-ID map. Each value is
  validated at the scene boundary as a string, boolean, null, or string array
  before it can reach runtime code. Date picker values use ISO strings on the
  wire; the compatibility adapter restores native dates.
- The compatibility adapter owns form state for the mounted command. It
  registers field IDs, retains uncontrolled defaults, accepts client-provided
  values, invokes `onChange` for the named field, and filters submit values to
  the currently registered fields. `Action.SubmitForm` submits the resulting
  values through the existing action event path.
- Measure the dependency-free control subset: `TextField`, `TextArea`,
  `PasswordField`, `Checkbox`, `Dropdown` with `Item` and `Section`,
  `DatePicker`, `TagPicker` with `Item`, `FilePicker`, `Description`,
  `Separator`, and `ActionPanel.Section`. Focus/blur callbacks remain
  explicit structured compatibility errors until they are measured and
  modeled.

## Consequences

- Form changes and submissions reuse the existing validated scene traffic and
  do not require a second interaction protocol.
- The desktop client can materialize a typed form tree without depending on
  React or Raycast component identity; it still needs a client-facing protocol
  and widgets before production rendering is possible.
- The wire value domain is intentionally JSON-compatible: string arrays carry
  tag selections and file paths, while ISO strings carry dates. Other richer
  control values require a new measured contract and validator tests rather
  than silently widening the map.
- A real child-process fixture now proves form rendering, field-change
  delivery, nested action groups, and typed submit-value round trips through
  the core relay.
