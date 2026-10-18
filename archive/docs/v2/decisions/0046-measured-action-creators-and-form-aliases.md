# ADR 0046: Measure action creators and deprecated Form aliases

- Status: accepted
- Date: 2026-08-29
- Decision owners: Blast V2 maintainers

## Context

The pinned Raycast corpus contained otherwise renderable commands using
`Action.CreateQuicklink`, `Action.PickDate`, and the deprecated direct Form
members `Form.DropdownItem`, `Form.DropdownSection`, and `Form.TagPickerItem`.
The adapter had the underlying Form item implementations but not the direct
aliases, and it rejected the two action creators as unmeasured children.

## Decision

- Render `Action.CreateQuicklink` as the measured generic action node. Validate
  the Quicklink's link, optional name, application, and icon, then route
  activation through `quicklink.create` with a JSON-encoded payload.
- Render `Action.PickDate` as the measured generic action node. Validate the
  title, picker type, optional bounds, icon, and shortcut, then route activation
  through `date-picker.pick`. The host returns an ISO string or null, which is
  restored to the callback's `Date | null` value.
- Expose direct deprecated Form dropdown and tag-picker members as identity
  aliases of the nested measured components, so parent-child validation and
  scene serialization remain identical.

The new operations remain deny-by-default capability requests. No quicklink is
created and no native picker is opened without an authorized host provider.

## Consequences

- Corpus commands using these measured shapes can publish scenes through the
  existing action and Form scene vocabulary.
- The scene contract does not gain action-specific props; host intent crosses
  the explicit capability boundary at activation time.
- Invalid Quicklink/date values and malformed picker responses remain
  structured compatibility errors.
- Adapter tests cover validation, alias identity, capability arguments, and
  date restoration; production quicklink and native date-picker providers
  remain host work.
