# ADR 0106: Present V2 collection accessories

- Status: Accepted
- Date: 2026-08-31

## Context

The measured Raycast adapter already serializes List item accessory arrays,
List accessory titles/icons, and Grid accessory icons/tooltips into primitive
scene properties. The V2 collection renderer currently displays only the
primary item icon, title, subtitle, and actions, so useful status, date, tag,
and accessory-icon information disappears at the client boundary.

## Decision

Extend the V2 collection renderer to:

- render List `accessoryTitle` and `accessoryIcon` in a compact trailing rail;
- parse the validated List `accessories` JSON string defensively and display
  its text/date/tag value, optional icon, tooltip, and safe color metadata;
- render Grid `accessoryIcon` and `accessoryTooltip` in the same trailing rail;
- reuse the V2 icon component for accessory-prefixed light/dark sources,
  fallbacks, masks, and tints; and
- ignore malformed or empty accessory records at the client edge without
  turning a valid scene into an application error.

Accessory values remain deterministic serialized strings; the client does not
localize dates, activate accessory records, or infer a new event contract.
Quick Look metadata and application chooser behavior remain separate host/client
work.

## Boundary

This is presentation of already-validated collection metadata in the opt-in V2
window. Defensive parsing is required because the current scene contract
intentionally carries the List accessory array as one primitive JSON string.
Safe color mapping follows the icon presentation policy and never places an
untrusted color string directly into inline CSS. V1 rendering, the protocol,
and the compatibility adapter remain unchanged.

## Consequences

Common List and Grid extensions retain their status/accessory context in the
V2 client, and accessory icons receive the same source/mask/tint behavior as
primary icons. The renderer remains resilient to old or malformed accessory
payloads, while native accessory interactions and localized formatting stay
explicitly outside this slice.

## Verification

- server-render List title/icon/array accessories and Grid accessory icons;
- cover malformed accessory JSON and unsafe accessory colors;
- keep scene, compatibility, and end-to-end fixtures green;
- type-check and Forge-bundle the Electron client; and
- retain the full V2 and format/lint gates.
