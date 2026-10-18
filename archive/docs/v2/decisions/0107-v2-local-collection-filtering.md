# ADR 0107: Add deterministic local collection filtering

- Status: Accepted
- Date: 2026-08-31

## Context

The Raycast-compatible adapter already preserves List and Grid filtering
metadata, search text, item titles, and item keywords as primitive scene
properties. The V2 client renders a search field and forwards
`onSearchTextChange`, but it does not perform the built-in filtering that
Raycast uses when filtering is enabled. Items therefore remain visible even
when a command relies on native collection filtering.

## Decision

Extend the V2 List and Grid renderer to:

- infer Raycast's default filtering mode: enabled when no search callback is
  present, disabled when a callback is present unless `filtering` is explicitly
  true;
- show the existing search field for either local filtering or a remote search
  callback;
- match a normalized query against each item's title and keyword array using a
  deterministic case-insensitive substring check;
- retain matching items in their source order and retain a section only when it
  still has a matching item; and
- leave remote/custom filtering authoritative when `filtering` is false, with
  no new scene events or protocol fields.

The client does not add fuzzy ranking, search over unmeasured accessory or
subtitle fields, or filtering behavior to dropdowns in this slice. An explicit
`filteringKeepSectionOrder` value is preserved as a future ranking policy even
though deterministic source order is the only local ranking used here.

## Boundary

This is a client-only interpretation of already-validated collection metadata.
The compatibility adapter, scene protocol, and host capability boundary remain
unchanged. Empty views and non-item controls remain renderable while local item
filtering is active.

## Consequences

Commands that rely on Raycast's built-in List/Grid filtering behave usefully in
the V2 window without requiring an extension callback. Commands that own
filtering continue to receive search events and retain responsibility for their
results. The deterministic matching rule is easy to exercise without Electron
or platform-specific APIs.

## Verification

- server-render filtered and unfiltered List/Grid collections;
- cover title/keyword matching, section retention, default inference, and
  remote/custom filtering behavior;
- type-check and Forge-bundle the Electron client; and
- retain the full V2, format, lint, and ARM64 package gates.
