# ADR 0088: Complete available client icon assets

- Status: Proposed
- Date: 2026-08-31

## Context

The compatibility adapter now mirrors all 478 members of the pinned Raycast
`Icon` declaration and preserves the two measured legacy names from ADR 0087.
The Electron client has a separate drawable lookup table, however, and its
historical source left many existing local SVG imports and map entries
commented out.

A bounded audit of the client icon directory found 316 local files. Of the
commented-out lookup entries, 174 have an exact matching local SVG and 102 do
not: the numbered `number-00` through `number-99` assets, `warning-16.svg`,
and `x-mark-circle-1.svg`. The client currently registers 131 icon map keys,
including the globe alias asset added by ADR 0087. This is a client drawable
coverage gap, not an adapter export or protocol gap.

## Decision

- Uncomment and register every commented import and lookup entry whose exact
  SVG already exists in the client icon directory.
- Leave the 102 absent assets explicitly unregistered until source artwork is
  available; do not invent replacements or generate new files in this slice.
- Keep unknown or absent icon identifiers on the existing warning/no-op path;
  do not add a generic fallback that could hide compatibility or asset errors.
- Keep icon descriptors, masks, tint metadata, and image transforms at their
  existing adapter/host boundary. This slice changes only the Electron
  client's local lookup table.

## Boundary

This decision improves rendering for already-available built-in SVGs only. It
adds no API names, scene fields, capabilities, transport messages, native
asset pipeline, or platform-specific providers. The adapter's 478-member
surface remains broader than the set of drawable assets available to this
client.

## Evidence

- The client icon module contains 131 active map keys before this slice.
- Its commented map contains 276 entries; 174 have matching local SVG files.
- The remaining 102 entries are the 100-number series plus the warning and
  `x-mark-circle-1` filenames listed above.
- The audit is local and deterministic; it adds no corpus checkout, package
  installation, generated bundle, or new binary asset.

## Verification

- Typecheck and lint the Electron client after registration.
- Keep the adapter suite, V2 suite, formatter check, and a bounded focused
  probe green; no full-corpus rerun is required for this asset-only change.
- Recount active map keys and confirm the absent-asset list remains explicit.

## Consequences

The client can draw all locally available icon assets referenced by the
existing map, including the measured legacy aliases' current glyphs, while
the remaining missing artwork stays visible and reviewable. Completing the
numbered or other absent assets is a separate asset-sourcing decision.
