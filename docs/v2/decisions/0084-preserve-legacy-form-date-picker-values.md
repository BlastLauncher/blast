# ADR 0084: Preserve legacy Form DatePicker values

- Status: Proposed
- Date: 2026-08-30

## Context

The current Raycast declaration exposes date-picker modes as
`Form.DatePicker.Type.Date` and `Form.DatePicker.Type.DateTime`. Older
Raycast extensions can still read the mode values directly from
`Form.DatePicker.Date` and `Form.DatePicker.DateTime`.

The pinned corpus contains two commands in the `paper` extension using
`Form.DatePicker.Date`. Both usages carry a `ts-expect-error` because the
current declaration no longer publishes that historical spelling, but the
runtime value is still required for the component to receive the intended
`"date"` mode. The adapter currently exposes only the modern `Type` object.

## Decision

- Add read-only runtime `Date` and `DateTime` aliases to `Form.DatePicker`.
  Each alias points to the corresponding value in `Form.DatePicker.Type`.
- Keep the existing `DatePickerType` union, default behavior, validation, and
  scene serialization unchanged. The aliases are value compatibility only;
  they do not introduce a new date mode.
- Keep the deprecated top-level `FormDatePicker` export in sync because it is
  the same component object and therefore receives the aliases automatically.
- Do not add unmeasured aliases to `Action.PickDate`; the measured legacy gap
  is specifically the Form component.

## Boundary

This slice changes no transport or host capability. The aliases resolve to
the existing primitive strings before the current form adapter validates and
serializes the component. Date values, form events, refs, and host-side date
picker behavior remain unchanged.

## Evidence

- The pinned declaration documents `Form.DatePicker.Type.Date` and
  `Form.DatePicker.Type.DateTime`.
- The local corpus has two direct `Form.DatePicker.Date` usages in `paper`;
  both are annotated as compatibility code for an older Raycast type surface.
- The adapter already centralizes the canonical values in
  `DATE_PICKER_TYPES`, so the compatibility aliases can share those values
  without duplicating or relaxing validation.

## Consequences

Older extensions that use the historical static values can construct the same
date-only field as extensions using the modern nested `Type` object. Current
extensions and the scene contract observe no behavior change, and the
adapter's public runtime object is closer to the historical Raycast surface.

## Verification

The implementation will assert identity between the legacy values and the
modern `Type` values and will render a date picker using the legacy value,
confirming that it serializes as `type: "date"`.
