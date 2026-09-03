# ADR 0085: Preserve Form Dropdown item keywords

- Status: Accepted
- Date: 2026-08-30

## Context

The pinned Raycast declaration accepts an optional `keywords: string[]` on
`Form.Dropdown.Item`, allowing a form dropdown to search an item by alternate
terms. The compatibility adapter validates and serializes the same property
for List and Grid dropdown items, but currently drops it from Form dropdown
items. The scene schema also omits the property from `form-dropdown-item`.

The local corpus contains 5,074 `Form.Dropdown.Item` nodes and 35 explicit
`keywords` attributes on those nodes. Dropping the values loses declared
search metadata even though the rest of the form dropdown already crosses the
scene boundary.

## Decision

- Add the declaration-shaped optional `keywords?: string[]` prop to the shared
  Form dropdown item type.
- Validate it with the existing string-array normalizer and carry it as a
  primitive string-array scene property when supplied; omit it when absent.
- Extend the scene allowlist and property-type schema for `form-dropdown-item`
  to accept `keywords`.
- Keep filtering, search ranking, and client presentation as consumer/client
  behavior. This slice only preserves the extension's declared metadata.

## Boundary

The value crosses the existing validated scene transaction as a bounded
string array. No new capability, transport message, host provider, or form
event is required, and malformed array members remain structured compatibility
errors at the adapter edge.

## Evidence

- The pinned `DropdownItemProps` declaration includes `keywords?: string[]`.
- The local corpus audit found 35 `keywords` attributes across the measured
  `Form.Dropdown.Item` nodes.
- List and Grid dropdown items already use the same normalizer and scene value
  type, so Form can share the established representation.

## Consequences

Form dropdown items retain their alternate search terms through the V2 scene
boundary. Existing items without keywords serialize identically, while a
future client can use the metadata for native dropdown filtering without
another extension API change.

## Verification

The adapter test suite renders a Form dropdown item with keywords and asserts
the serialized string array. The scene suite accepts the new property, and
the existing no-keywords shape remains unchanged. The focused scene and
adapter suites pass; the aggregate corpus counters remain unchanged because
this slice preserves metadata without changing command selection or host
execution.
