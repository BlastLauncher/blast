# ADR 0079: Preserve Raycast image descriptor metadata

- Status: Accepted
- Date: 2026-08-30

## Context

The Raycast `Image` contract is broader than a single icon string. An image can
provide light and dark sources, a fallback, a circle or rounded-rectangle mask,
and a tint color with light/dark values and optional contrast adjustment. Before
this slice, the compatibility adapter validated some of these shapes but
serialized only the primary light source and light tint. `fallback` and `mask`
were dropped, and a non-null `mask` was validated without reaching the scene or
capability boundary.

`Image` is imported by 433 corpus extensions (13.4%), and image-like values are
used throughout List, Grid, actions, menu-bar items, metadata, forms, and host
operation payloads. This is an adapter/scene fidelity gap, distinct from the
future client's actual image loading and rendering behavior.

## Decision

- Keep the existing `icon`/`content` light-source fields for backwards
  compatibility and add optional scene metadata for dark sources, fallbacks,
  masks, dark tints, and `adjustContrast`.
- Normalize the same metadata for every adapter-owned icon-bearing scene field,
  including accessory and Grid content prefixes, and for JSON-encoded
  quicklink, MCP, date-picker, and alert payloads.
- Treat explicit `null` fallback and mask values as omitted, as allowed by the
  Raycast declaration. Validate theme-aware source/fallback variants,
  supported masks, and dynamic tint contrast flags at the adapter edge.
- Preserve the metadata as primitive scene values only. Client theme selection,
  image loading, fallback activation, masking, tinting, and contrast adjustment
  remain client/host work and are not inferred by the Linux measurement host.

## Boundary

This slice does not download images, access extension assets, or add a client
image renderer. It does not make URL/network access available. Existing clients
may ignore the new optional fields until they implement the corresponding
image transforms; the primary light-source field remains unchanged.

## Evidence

- The pinned Raycast declaration defines `Image.Source`, `Image.Fallback`,
  `Image.Mask`, and dynamic tint colors with `adjustContrast`.
- `serializeIcon` now preserves source and fallback light/dark variants, both
  supported masks, and dynamic tint metadata across scene fields and the
  quicklink, MCP, date-picker, and alert payloads. Explicit null fallback,
  mask, and tint values are omitted.
- Deterministic verification covers the scene contract (50 tests), the
  compatibility adapter (89 tests), and the full e2e fixture set (41 tests),
  including invalid descriptor values and both mask variants.

## Consequences

Raycast image descriptors no longer lose their declared transforms while
crossing the V2 semantic boundary. The aggregate corpus counters should remain
unchanged because this is metadata fidelity and does not add image providers,
network access, or dependency provisioning.
