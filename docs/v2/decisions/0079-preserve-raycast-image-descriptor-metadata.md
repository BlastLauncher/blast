# ADR 0079: Preserve Raycast image descriptor metadata

- Status: Proposed
- Date: 2026-08-30

## Context

The Raycast `Image` contract is broader than a single icon string. An image can
provide light and dark sources, a fallback, a circle or rounded-rectangle mask,
and a tint color with light/dark values and optional contrast adjustment. The
compatibility adapter currently validates some of these shapes but serializes
only the primary light source and light tint. `fallback` and `mask` are dropped,
and a non-null `mask` is validated without reaching the scene or capability
boundary.

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
- The current adapter's `serializeIcon` validates a subset of these values but
  drops fallback and mask metadata and resolves theme-aware values to light.
- Deterministic scene, adapter, and capability-payload tests will cover source
  and fallback variants, both masks, dynamic tints, explicit nulls, and invalid
  descriptor values.

## Consequences

Raycast image descriptors no longer lose their declared transforms while
crossing the V2 semantic boundary. The aggregate corpus counters should remain
unchanged because this is metadata fidelity and does not add image providers,
network access, or dependency provisioning.
