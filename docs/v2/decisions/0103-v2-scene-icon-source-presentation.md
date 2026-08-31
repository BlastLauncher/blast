# ADR 0103: Present V2 scene icon and image sources

- Status: Accepted
- Date: 2026-08-31

## Context

The scene contract already carries light and dark icon/content sources,
fallbacks, and the metadata needed for the measured Raycast image surface. The
V2 Electron scene currently ignores the registered icon assets and reduces
non-URL sources to their first letter, so the client-facing list, grid,
menu-bar, and empty-view surfaces lose useful visual identity.

## Decision

Add a reusable V2 scene icon component that:

- prefers the dark source on the dark V2 client, then the light source and
  their fallbacks;
- renders known keys from the existing client SVG registry;
- renders `data:image/*` and HTTP(S) sources as images after normalizing raw SVG
  data URLs; and
- retains a deterministic letter fallback for unknown or unsupported sources.

The component accepts both icon-prefixed and grid-content-prefixed scene
properties. It does not enable filesystem-backed image URLs, invent a network
policy, or implement mask and tint transforms; those remain separate host or
client decisions.

## Boundary

This makes already-validated scene image sources visible in the opt-in V2
window without adding image data or Electron types to the protocol. It covers
source selection and presentation only; image loading failures continue to use
the browser's normal image behavior and the deterministic source fallback.

## Consequences

Registered Raycast icon names and safe remote/data image descriptors now render
on the primary V2 scene surfaces. Dark-theme source precedence is explicit and
testable, while unsupported local paths and visual transforms remain visible as
known future work instead of becoming implicit filesystem or security policy.

## Verification

- server-render registered, dark/fallback, data-image, and unknown-source cases;
- keep the existing scene interaction fixtures green;
- type-check and Forge-bundle the Electron client; and
- retain the full V2 and format/lint gates.
