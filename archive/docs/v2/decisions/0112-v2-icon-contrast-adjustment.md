# ADR 0112: Adjust V2 icon tint contrast deterministically

- Status: Accepted
- Date: 2026-08-31

## Context

V2 already preserves Raycast's `adjustContrast` intent and presents masks,
tints, registered SVGs, safe image sources, and fallbacks. The renderer did not
yet use that intent, so a valid light/dark tint could blend into Blast's canvas.
Raycast's color contract treats contrast adjustment as the default for raw and
dynamic colors and allows a dynamic color to disable it explicitly.

The client needs a platform-independent policy that works during server render,
does not inspect arbitrary image pixels, and does not put extension-controlled
CSS into unsafe inline declarations.

## Decision

The V2 scene icon renderer will:

- adjust colors unless the validated dynamic tint explicitly sets
  `adjustContrast: false`;
- parse hex and opaque RGB(A)/HSL(A) values plus a small set of common CSS
  color keywords;
- preserve unsupported CSS variables and keywords unchanged;
- target a minimum 3:1 contrast ratio against the light (`#fcfcfc`) or dark
  (`#161616`) V2 canvas;
- move a low-contrast color toward whichever of black or white reaches the
  target with the smallest change; and
- apply the resulting color to registered icons, safe external images, and
  deterministic fallbacks through the existing tint path.

The calculation is deterministic and returns an opaque hex value only when the
input can be parsed safely. `adjustContrast: false` preserves the normalized
color exactly. The raw source and the effective adjustment intent remain
available as data attributes for inspection.

## Boundary

This is client-only tint presentation. It does not analyze source-image pixels,
change the semantic scene contract, add a native image dependency, or alter
extension-owned color values before they cross the validated boundary. A future
native client may use a different presentation implementation.

## Consequences

Common Raycast colors and literal colors remain legible across both themes while
exact-color callers can opt out through the existing API metadata. Unsupported
CSS expressions retain their previous behavior rather than being guessed or
injected into styles.

## Verification

- test contrast adjustment and explicit opt-out across both themes;
- test registered, external-image, Grid-content, accessory, and fallback icon
  paths through the existing server-render smoke;
- assert the minimum ratio for adjusted colors and preservation for unsupported
  values;
- type-check and Forge-bundle the Electron client; and
- keep the full V2, lint, and format gates green.
