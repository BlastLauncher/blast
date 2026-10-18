# ADR 0018: Richer Form controls and wire values

- Status: accepted
- Date: 2026-08-28

## Context

The first Form slice covered controls whose values were already represented by
the scene event value domain. The measured API surface also includes
`DatePicker`, `TagPicker`, and `FilePicker`; leaving these as compatibility
errors blocked dependency-free form extensions even though their values have a
small JSON-compatible representation.

## Decision

- Add `form-date-picker`, `form-tag-picker` with `form-tag-picker-item`, and
  `form-file-picker` scene nodes with strict property whitelists and the
  documented parent-child relationships.
- Represent `DatePicker` values as ISO-8601 strings on the scene wire and
  restore them to native `Date | null` values for adapter `onChange` and
  `onSubmit` callbacks. Serialize `type`, `min`, and `max` as date-picker
  metadata strings.
- Represent `TagPicker` and `FilePicker` values as arrays of strings. File
  values are paths supplied by the client; picker options remain explicit
  boolean scene properties.
- Keep form field IDs, event identifiers, and submit filtering on the existing
  validated `scene.event` path. The adapter owns the codec for each registered
  field, so client wire values cannot be passed to extension callbacks without
  type validation and conversion.

## Consequences

- The scene contract remains independent of React, Electron, Node.js, and
  concrete transports while supporting the measured multi-value controls.
- Renderer array props are copied and compared by contents, preventing fresh
  equivalent arrays from producing spurious transactions.
- Focus/blur callbacks remain structured compatibility errors; imperative form
  refs and client-side picker behavior remain outside this slice.
- The form child-process fixture exercises date, tag-array, and file-path
  field changes and submit round trips through the full relay.
