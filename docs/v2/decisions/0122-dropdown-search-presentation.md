# ADR 0122: Present dropdown search callbacks in the V2 renderer

- Status: Accepted
- Date: 2026-09-01

## Context

The Raycast adapter and scene contract already preserve `onChange` and
`onSearchTextChange` for `List.Dropdown`, `Grid.Dropdown`, and `Form.Dropdown`.
The Electron renderer presents their selection controls, but it has no search
field for the dropdown-specific search callback. An extension can therefore
receive a serialized callback without a usable client affordance.

The `ActionPanel.Submenu` open/search lifecycle and `MenuBarExtra.Item`
alternate right-click path are already implemented under ADRs 0113 and 0101;
this slice closes the remaining renderer gap in the same interaction family.

## Decision

Add a renderer-owned search field to every dropdown that enables local filtering
or declares `onSearchTextChange`:

- maintain search text locally per rendered dropdown;
- send `{ searchText }` through the existing `scene.event` bridge when the
  dropdown declares `onSearchTextChange`;
- locally filter dropdown items by title, value, and declared keywords when
  `filtering` is true, preserving section order and item order;
- when `filtering` is false, keep the extension-owned filtering path and use
  the callback event without hiding items locally; and
- preserve the existing selection event payloads and Form field value bag.

The implementation remains a client presentation change: no new protocol
message, capability, provider, or native dependency is introduced. Search
inputs use the existing semantic scene properties and the existing event
validator.

## Boundary

The adapter validates callback types and creates stable event IDs. The scene
contract validates the callback properties and dropdown children. The renderer
owns the search input and local filtering policy. Extension-owned filtering
continues to be driven by refreshed scene transactions after the callback.

## Consequences

Measured dropdown search callbacks are usable in the packaged V2 client for
List, Grid, and Form controls. Local filtering remains deterministic and does
not attempt to reproduce Raycast's ranking algorithm. The existing submenu and
menu-bar alternate interaction behavior is regression-tested rather than
duplicated.

## Verification

- server-render search inputs for List/Grid/Form dropdowns;
- test local title/value/keyword filtering and section preservation;
- test callback-mode rendering without local item removal;
- retain adapter callback and scene event validation coverage; and
- keep the V2 build, Electron tests, formatting, lint, and ARM64-safe checks
  green without generating corpus bundles.
