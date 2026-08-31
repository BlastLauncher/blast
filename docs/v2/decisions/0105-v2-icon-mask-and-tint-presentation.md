# ADR 0105: Present V2 icon masks and supported tint colors

- Status: Accepted
- Date: 2026-08-31

## Context

The measured Raycast image descriptor already carries `Image.Mask`, light and
dark tint colors, and `adjustContrast` through the scene contract. ADR 0103
made the source and fallback visible in the opt-in V2 window, but the client
still ignored the mask and tint fields. This makes common tinted icons look
unrelated to the extension's intended presentation even though the metadata
has crossed the trusted boundary correctly.

## Decision

Extend the reusable V2 scene icon component to:

- clip registered icons, image sources, and deterministic fallbacks as a
  circle or rounded rectangle when the validated mask is present;
- select light/dark tint metadata by the client's existing `.dark` theme,
  mapping the built-in Raycast color names and safe CSS color literals to CSS
  custom properties;
- recolor registered monochrome SVG assets through `currentColor` and apply a
  deterministic monochrome color overlay to safe data/HTTP(S) image sources;
  and
- retain the raw `adjustContrast` intent as a data attribute without adding a
  heuristic that could reduce contrast or alter arbitrary image content.

Unsupported color strings remain visible through the original source and do
not enter an inline style. The content-prefixed Grid icon fields use the same
rules as icon-prefixed fields. No filesystem access, network policy, protocol
field, or native image-processing dependency is added.

## Boundary

This is client-only presentation of already-validated scene metadata. It does
not add image loading, native contrast calculation, OS appearance ownership, or
support for new Raycast image values. V1 rendering and the compatibility
adapter remain unchanged.

## Consequences

Measured masks and common theme/raw tint colors now affect all V2 icon
surfaces, including Grid content and fallback glyphs. The color allowlist
keeps extension-controlled values out of inline CSS while preserving unknown
values as non-destructive metadata. Automatic contrast adjustment is defined
separately and is implemented by [ADR 0112](0112-v2-icon-contrast-adjustment.md).

## Verification

- server-render masked registered, tinted, content-prefixed, and external-image
  cases;
- assert unsafe tint values do not enter inline styles;
- keep scene and compatibility fixtures green;
- type-check and Forge-bundle the Electron client; and
- retain the full V2 and format/lint gates.
