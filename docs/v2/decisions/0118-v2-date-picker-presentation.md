# ADR 0118: Present V2 date-picker controls with native date inputs

- Status: Accepted
- Date: 2026-09-01

## Context

The compatibility adapter already validates `Form.DatePicker` values as
`Date | null` and serializes them as ISO strings across the scene contract. It
also preserves the declaration-backed `date` and `date_time` modes and optional
minimum and maximum dates. The V2 renderer currently displays both modes as a
plain text input, which loses calendar controls and makes it easy to send a
value that does not match the declared mode.

The renderer can improve this without a protocol or host change. HTML date
controls provide the needed OS-independent client behavior; conversion at the
renderer edge can continue to use the existing ISO wire representation.

## Decision

Render `form-date-picker` as:

- `input[type="date"]` for the `date` mode; and
- `input[type="datetime-local"]` for the `date_time` mode.

Convert valid ISO wire values and bounds to the local input format. On change,
convert a selected local date/time back to an ISO string and send `null` when
the control is cleared. Preserve the existing `onFocus`, `onBlur`, disabled,
error, and form-value behavior, and honor `autoFocus`, `min`, and `max`.

Invalid or absent scene values render as an empty control rather than being
invented or sent to the extension. The renderer does not add timezone policy,
native calendar providers, or a new scene property.

## Boundary

This is Electron V2 renderer presentation over the existing scene/form event
contract. It does not change Raycast API declarations, extension runtime
serialization, protocol messages, or host capabilities.

## Consequences

Date and date-time forms are usable with the platform's built-in calendar/time
controls while extension callbacks continue to receive the same ISO/null wire
values that the compatibility adapter already reconstructs as `Date | null`.
Local timezone conversion is explicit and symmetric for display and change
events; the resulting ISO instant may differ from the typed local time by the
machine's timezone offset, as expected for a JavaScript `Date`.

## Verification

- server-render both input modes with formatted values and bounds;
- verify cleared and invalid values are handled deterministically;
- preserve form event and disabled/autofocus behavior;
- type-check and Forge-bundle the Electron client; and
- keep generated packaging artifacts out of the worktree.
